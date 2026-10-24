import { execInSidecar } from './docker'
import { iconNameOk, parseDesktopDump, type DesktopEntry } from './desktopEntries'

const LIST_SCRIPT = `
for d in /usr/share/applications /usr/local/share/applications /home/bros/.local/share/applications; do
  [ -d "$d" ] || continue
  for f in "$d"/*.desktop; do
    [ -f "$f" ] || continue
    printf '\\n---ENTRY %s\\n' "$f"
    cat "$f"
  done
done
printf '\\n---OPEN\\n'
/app/lib/sidecars/core/desktop/desktop-gui.sh status || true
`

const ICON_SCRIPT = `
name=$1
case $name in
  /*)
    case $name in
      /usr/share/pixmaps/*|/usr/share/icons/*) ;;
      *) exit 1 ;;
    esac
    [ -f "$name" ] || exit 1
    path=$name
    ;;
  *)
    path=
    for ext in png svg xpm; do
      f="/usr/share/pixmaps/$name.$ext"
      if [ -f "$f" ]; then path=$f; break; fi
    done
    if [ -z "$path" ]; then
      path=$(find /usr/share/icons/hicolor -type f \\( -name "$name.png" -o -name "$name.svg" \\) 2>/dev/null | sort | tail -n 1)
    fi
    [ -n "$path" ] || exit 1
    ;;
esac
printf '%s\\n' "$path"
base64 -w0 "$path"
`

export async function readDesktopCatalog(): Promise<{ entries: DesktopEntry[], openIds: string[], openCounts: Record<string, number> }> {
  try {
    const res = await execInSidecar('desktop', ['bash', '-c', LIST_SCRIPT], 20_000)
    if (res.code !== 0) return { entries: [], openIds: [], openCounts: {} }
    return parseDesktopDump(res.stdout)
  } catch {
    return { entries: [], openIds: [], openCounts: {} }
  }
}

function mimeFor(path: string) {
  if (path.endsWith('.svg')) return 'image/svg+xml'
  if (path.endsWith('.xpm')) return 'image/x-xpixmap'
  return 'image/png'
}

export async function readDesktopIcon(name: string): Promise<{ mime: string, body: Buffer } | null> {
  if (!iconNameOk(name)) return null
  try {
    const res = await execInSidecar('desktop', ['bash', '-c', ICON_SCRIPT, 'bash', name], 20_000)
    if (res.code !== 0) return null
    const nl = res.stdout.indexOf('\n')
    if (nl <= 0) return null
    const path = res.stdout.slice(0, nl).trim()
    const body = Buffer.from(res.stdout.slice(nl + 1).trim(), 'base64')
    if (!body.length) return null
    return { mime: mimeFor(path), body }
  } catch {
    return null
  }
}
