import { merchantClient,merchantConfig } from "../lib/payments/merchantpayd-client.ts";
import { MERCHANTPAYD_METHODS } from "../lib/payments/merchantpayd-methods.ts";
const config=merchantConfig();
if(!config.apiKey||!config.apiSecret||!config.webhookSecret||!config.banking?.apiKey||!config.banking.apiSecret||!config.bankingWebhookSecret)throw new Error("RebohromePayment server credentials are incomplete.");
// Read-only probe: a nonexistent ID must return authenticated 'not found', never create a link.
for (const method of ['cash-app-v4','banking']) {
  try {await merchantClient(config).status('00000000-0000-0000-0000-000000000000',method);throw new Error("Unexpected payment returned for preflight identifier.");}
  catch(error) {
    if(error.message==='Payment provider returned HTTP 404.') console.log(`${MERCHANTPAYD_METHODS[method]} authentication probe passed (unknown payment: 404). No payment created.`);
    else {console.error(error.message);process.exitCode=1;}
  }
}
