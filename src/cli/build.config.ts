import { defineBuildConfig } from 'unbuild'

const nativeExternals = ['better-sqlite3', 'ssh2']

// NODE_PATH is CommonJS-only. Prod sets it to Nitro's traced node_modules.
function nativeRequirePlugin() {
  const spec = nativeExternals.join('|')
  const named = new RegExp(`import\\s+([A-Za-z_$][\\w$]*)\\s+from\\s+'(${spec})';`, 'g')
  const bare = new RegExp(`import\\s+'(${spec})';`, 'g')
  return {
    name: 'bros-native-require',
    renderChunk(code: string) {
      if (!named.test(code) && !bare.test(code)) return null
      named.lastIndex = 0
      bare.lastIndex = 0
      const next = code
        .replace(named, (_match: string, name: string, pkg: string) => `const ${name} = brosRequire('${pkg}');`)
        .replace(bare, (_match: string, pkg: string) => `brosRequire('${pkg}');`)
      return {
        code: `import { createRequire as brosCreateRequire } from 'node:module';\nconst brosRequire = brosCreateRequire(import.meta.url);\n${next}`,
        map: null,
      }
    },
  }
}

export default defineBuildConfig({
  entries: ['index'],
  clean: true,
  declaration: false,
  // dockerode → ssh2 and db → better-sqlite3 ship native .node files.
  // Leave them as runtime imports so Rollup never parses the ELF.
  externals: nativeExternals,
  rollup: {
    inlineDependencies: true,
  },
  hooks: {
    'rollup:options'(_ctx, options) {
      options.plugins.push(nativeRequirePlugin())
    },
  },
})
