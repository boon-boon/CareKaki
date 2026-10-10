// Netlify Function (v2): health probe, mirroring the Node server's GET /health.
// The Angular app polls this (and /mcp) to decide between live and offline mode.
//
// Routed to /health by the [[redirects]] block in netlify.toml.
export default async function carekakiHealth() {
  return Response.json({
    status: "ok",
    service: "carekaki-mcp",
    data_source: "fictional_demo",
    runtime: "netlify-functions",
  });
}
