import { merchantClient,merchantConfig } from "../lib/payments/merchantpayd-client.ts";
const config=merchantConfig();
if(!config.apiKey||!config.apiSecret||!config.webhookSecret)throw new Error("MerchantPayd server credentials are incomplete.");
// Read-only probe: a nonexistent ID must return authenticated 'not found', never create a link.
try {await merchantClient(config).status('00000000-0000-0000-0000-000000000000');throw new Error("Unexpected payment returned for preflight identifier.");}
catch(error) {
  if(error.message==='Payment provider returned HTTP 404.') console.log("MerchantPayd authentication probe passed (unknown payment: 404). No payment created.");
  else {console.error(error.message);process.exitCode=1;}
}
