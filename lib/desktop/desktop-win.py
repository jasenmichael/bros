#!/usr/bin/env python3
"""List labwc windows and focus one. labwc's socket has no focus command."""
import json
import os
import socket
import struct
import sys

RUNTIME = os.environ.get("XDG_RUNTIME_DIR", "/home/bros/.XDG")
WAYLAND = os.environ.get("WAYLAND_DISPLAY", "wayland-0")


def app_match(app_id: str, name: str) -> bool:
    got = (app_id or "").casefold()
    want = (name or "").casefold()
    if not got or not want:
        return False
    if got == want or got.endswith("." + want) or got.endswith("-" + want):
        return True
    return want in got.replace(".", "-").split("-")


def mapped(win) -> bool:
    # Minimized keeps its place. A 0×0 entry is an unmapped leftover, not a window.
    if win.get("minimized"):
        return True
    if "width" not in win and "height" not in win:
        return True
    return int(win.get("width") or 0) > 0 or int(win.get("height") or 0) > 0


def matched(wins: list, app: str, pids: set[int]) -> list:
    rows = []
    for win in wins:
        if not mapped(win):
            continue
        pid = int(win.get("pid") or 0)
        aid = str(win.get("app_id") or "")
        if (pid and pid in pids) or app_match(aid, app):
            rows.append(win)
    return rows


def match_count(wins: list, app: str, pids: set[int]) -> int:
    return len(matched(wins, app, pids))


def labwc_windows():
    path = os.path.join(RUNTIME, "labwc.sock")
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.settimeout(2)
    try:
        sock.connect(path)
        sock.sendall(b"GET_WINDOWS\n")
        buf = b""
        while True:
            try:
                chunk = sock.recv(65536)
            except (TimeoutError, socket.timeout):
                break
            if not chunk:
                break
            buf += chunk
    except OSError:
        return None
    finally:
        sock.close()
    text = buf.decode(errors="replace").strip()
    if not text:
        return None
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None
    if data is None:
        return []
    if isinstance(data, dict):
        return [data]
    if isinstance(data, list):
        return data
    return None


def enc_str(text: str) -> bytes:
    raw = text.encode() + b"\0"
    pad = (4 - (len(raw) % 4)) % 4
    return struct.pack("<I", len(raw)) + raw + (b"\0" * pad)


def take_str(payload: bytes, off: int):
    (n,) = struct.unpack_from("<I", payload, off)
    off += 4
    raw = payload[off:off + n]
    off += n
    if off % 4:
        off += 4 - (off % 4)
    return raw.split(b"\0", 1)[0].decode(errors="replace"), off


def take_array(payload: bytes, off: int):
    (n,) = struct.unpack_from("<I", payload, off)
    off += 4
    data = payload[off:off + n]
    off += n
    if off % 4:
        off += 4 - (off % 4)
    vals = [struct.unpack_from("<I", data, i)[0] for i in range(0, len(data) - 3, 4)]
    return vals, off


class Wayland:
    def __init__(self, path: str):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(2)
        self.sock.connect(path)
        self.buf = b""
        self.next_id = 2
        self.handlers = {}

    def alloc(self) -> int:
        num = self.next_id
        self.next_id += 1
        return num

    def send(self, obj: int, opcode: int, payload: bytes = b""):
        size = 8 + len(payload)
        if size % 4:
            raise RuntimeError("wayland size")
        self.sock.sendall(struct.pack("<II", obj, (size << 16) | opcode) + payload)

    def recv_one(self):
        while len(self.buf) < 8:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise EOFError
            self.buf += chunk
        _obj, word = struct.unpack_from("<II", self.buf)
        size = word >> 16
        opcode = word & 0xFFFF
        if size < 8:
            raise RuntimeError("wayland header")
        while len(self.buf) < size:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise EOFError
            self.buf += chunk
        payload = self.buf[8:size]
        self.buf = self.buf[size:]
        return _obj, opcode, payload

    def dispatch(self, obj: int, opcode: int, payload: bytes):
        if obj == 1 and opcode == 0:
            raise RuntimeError("wayland display error")
        fn = self.handlers.get(obj)
        if fn:
            fn(opcode, payload)

    def roundtrip(self):
        cb = self.alloc()
        self.send(1, 0, struct.pack("<I", cb))
        while True:
            obj, opcode, payload = self.recv_one()
            if obj == cb and opcode == 0:
                return
            self.dispatch(obj, opcode, payload)


def wayland_path() -> str:
    if WAYLAND.startswith("/"):
        return WAYLAND
    return os.path.join(RUNTIME, WAYLAND)


def focus(app: str) -> int:
    """0 focused, 1 no window, 2 compositor unavailable."""
    globals_ = []

    def on_registry(opcode, payload):
        if opcode != 0:
            return
        (name,) = struct.unpack_from("<I", payload, 0)
        iface, off = take_str(payload, 4)
        (ver,) = struct.unpack_from("<I", payload, off)
        globals_.append((name, iface, ver))

    try:
        wl = Wayland(wayland_path())
    except OSError:
        return 2
    reg = wl.alloc()
    wl.handlers[reg] = on_registry
    try:
        wl.send(1, 1, struct.pack("<I", reg))
        wl.roundtrip()
    except (OSError, EOFError, RuntimeError, TimeoutError, socket.timeout):
        return 2
    manager = next((row for row in globals_ if row[1] == "zwlr_foreign_toplevel_manager_v1"), None)
    seat = next((row for row in globals_ if row[1] == "wl_seat"), None)
    if not manager:
        return 2
    wins = {}

    def on_handle(wid, opcode, payload):
        win = wins[wid]
        if opcode == 1:
            win["app_id"], _ = take_str(payload, 0)
        elif opcode == 4:
            vals, _ = take_array(payload, 0)
            win["minimized"] = 1 in vals
            win["activated"] = 2 in vals
        elif opcode == 6:
            win["closed"] = True

    def on_manager(opcode, payload):
        if opcode != 0:
            return
        (wid,) = struct.unpack_from("<I", payload, 0)
        wins[wid] = {"app_id": "", "minimized": False, "activated": False, "closed": False}
        wl.handlers[wid] = lambda op, body, i=wid: on_handle(i, op, body)

    man_id = wl.alloc()
    seat_id = wl.alloc() if seat else 0
    wl.handlers[man_id] = on_manager
    ver = min(manager[2], 3)
    wl.send(reg, 0, struct.pack("<I", manager[0]) + enc_str(manager[1]) + struct.pack("<II", ver, man_id))
    if seat:
        wl.send(reg, 0, struct.pack("<I", seat[0]) + enc_str(seat[1]) + struct.pack("<II", min(seat[2], 1), seat_id))
    try:
        wl.roundtrip()
    except (OSError, EOFError, RuntimeError, TimeoutError, socket.timeout):
        return 2
    picks = [item for item in wins.items() if not item[1]["closed"] and app_match(item[1]["app_id"], app)]
    if not picks:
        ids = sorted({row["app_id"] for row in wins.values() if row["app_id"] and not row["closed"]})
        print("no window for", app, "have", ",".join(ids), file=sys.stderr)
        return 1
    picks.sort(key=lambda item: (not item[1]["minimized"], item[1]["activated"]))
    wid = picks[0][0]
    wl.send(wid, 3)
    if seat_id:
        wl.send(wid, 4, struct.pack("<I", seat_id))
    try:
        wl.roundtrip()
    except (OSError, EOFError, RuntimeError, TimeoutError, socket.timeout):
        return 2
    return 0


def self_check() -> None:
    assert app_match("Cursor", "cursor")
    assert app_match("co.anysphere.cursor", "cursor")
    assert app_match("cursor-url-handler", "cursor")
    assert not app_match("xterm", "cursor")
    assert not app_match("xcursor", "cursor")
    wins = [{"pid": 5, "app_id": "Cursor", "minimized": True}]
    assert match_count(wins, "cursor", {9}) == 1
    assert match_count([{"pid": 1, "app_id": "weird"}], "cursor", {1}) == 1
    assert match_count([{"pid": 2, "app_id": "foot"}], "cursor", {1}) == 0
    hidden = {"pid": 5, "app_id": "cursor", "title": "cursor", "width": 0, "height": 0}
    visible = {"pid": 5, "app_id": "cursor", "title": "Cursor Agents", "width": 800, "height": 600}
    assert match_count([hidden], "cursor", {5}) == 0
    assert match_count([visible, hidden], "cursor", set()) == 1
    assert match_count([{"pid": 5, "app_id": "", "width": 0, "height": 0}], "cursor", {5}) == 0
    raw = enc_str("cursor")
    got, off = take_str(raw, 0)
    assert got == "cursor" and off == len(raw)
    vals, end = take_array(struct.pack("<I", 4) + struct.pack("<I", 1), 0)
    assert vals == [1] and end == 8


def main(argv: list[str]) -> int:
    if argv[1:2] == ["--self-check"]:
        self_check()
        return 0
    if len(argv) < 3 or argv[1] not in ("count", "focus"):
        print("usage: desktop-win.py count|focus APP [PID...]", file=sys.stderr)
        return 2
    app = argv[2]
    if argv[1] == "focus":
        return focus(app)
    pids = set()
    for token in argv[3:]:
        if token.isdigit():
            pids.add(int(token))
    wins = labwc_windows()
    if wins is None:
        return 2
    rows = matched(wins, app, pids)
    print(len(rows))
    for win in rows:
        aid = str(win.get("app_id") or "")
        if app_match(aid, app):
            print(aid)
            break
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv))
    except BrokenPipeError:
        sys.exit(0)
