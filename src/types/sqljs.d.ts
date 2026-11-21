/**
 * Build "wasm-inline" do sql.js: o WebAssembly vem embutido em base64 dentro do
 * próprio JS. Assim o leitor de GeoPackage não precisa baixar um arquivo .wasm
 * separado (o que seria bloqueado pelo protocolo file:// do Electron em produção).
 */
declare module 'sql.js/dist/sql-wasm-inline.js' {
  const initSqlJs: typeof import('sql.js').default;
  export default initSqlJs;
}
