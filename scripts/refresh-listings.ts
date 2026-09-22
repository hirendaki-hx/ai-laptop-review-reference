import dotenv from 'dotenv';
dotenv.config();

import { refreshExistingProductListings } from '../src/server/db.ts';

async function main() {
  console.log('='.repeat(60));
  console.log('[Script] Starting Scheduled Price & Image Refresh');
  console.log(`[Script] Timestamp: ${new Date().toISOString()}`);
  console.log('='.repeat(60));

  try {
    const result = await refreshExistingProductListings();

    console.log(`\nSummary:`);
    console.log(`• Total Listings:        ${result.total}`);
    console.log(`• Successfully Updated:  ${result.updated}`);
    console.log(`• Price Changes Logged:  ${result.priceChangedCount}`);
    console.log(`• Failed / Retried:      ${result.failed}`);

    if (result.details.length > 0) {
      console.log(`\nListing Details:`);
      for (const d of result.details) {
        const retailerLabel = d.retailer.toUpperCase().padEnd(8);
        const oldP = d.oldPrice !== null ? `₹${d.oldPrice.toLocaleString('en-IN')}` : 'None';
        const newP = d.newPrice !== null ? `₹${d.newPrice.toLocaleString('en-IN')}` : 'No price';
        const changeTag = d.priceChanged ? ' [PRICE CHANGED -> LOGGED]' : '';
        const imgTag = d.imageUpdated ? ' [IMAGE UPDATED]' : '';
        const errTag = d.error ? ` [ERROR: ${d.error}]` : '';

        console.log(`  [${retailerLabel}] ${d.productUrl}`);
        console.log(`     Price: ${oldP} -> ${newP}${changeTag}${imgTag}${errTag}`);
      }
    } else {
      console.log('\nNo listings currently registered in the database.');
    }

    console.log('\n' + '='.repeat(60));
    console.log('[Script] Price & image refresh completed successfully.');
    console.log('='.repeat(60));
    process.exit(0);
  } catch (err: any) {
    console.error('\n[Script] Fatal error during price & image refresh:', err.message || err);
    process.exit(1);
  }
}

main();
