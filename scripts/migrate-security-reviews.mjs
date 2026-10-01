import { migrateLegacySecurityReviews } from '../src/lib/db/securityReviewMigration.ts';

console.log(JSON.stringify(await migrateLegacySecurityReviews()));
