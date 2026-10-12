import { getIssuer } from "@/src/lib/oauth/oidc";

export async function GET() {
  try {
    const issuer=getIssuer();
    return Response.json({
      resource:issuer+"/api/mcp",
      authorization_servers:[issuer],
      bearer_methods_supported:["header"],
      scopes_supported:["mcp:connect","oauth:read"],
      resource_documentation:issuer+"/developer/oidc"
    },{headers:{"Cache-Control":"public, max-age=300","Content-Type":"application/json; charset=utf-8"}});
  } catch {
    return Response.json({error:"resource_metadata_unavailable"},{status:503,headers:{"Cache-Control":"no-store"}});
  }
}
