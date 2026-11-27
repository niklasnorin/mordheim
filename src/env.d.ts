/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    /** The campaign this request is in: the one its `/c/<slug>/` prefix names, else the front door (src/middleware.ts). */
    campaign: import('./campaign/campaign').CampaignConfig;
    /** The path every link and API call of this request starts with: '' for the front door, `/c/<slug>` for another campaign. */
    base: string;
  }
}
