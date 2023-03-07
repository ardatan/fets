const { build } = require('esbuild');

async function main() {
  await build({
    entryPoints: ['./src/index.ts'],
    outfile: 'pages/api/fets.js',
    format: 'cjs',
    minify: false,
    bundle: true,
    platform: 'node',
    target: 'es2020',
  });

  console.info(`Vercel Function build done!`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
