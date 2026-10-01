// THE CATALOGUE. Every product the shop sells, in one array.
//
// The product types, the helpers and the admin input validation used to sit
// on top of this array. They moved to ./productModel.ts and ./productInput.ts
// on 2026-08-11 and are re-exported below, so every '@/data/products' import
// keeps working exactly as before.
import type { Product } from './productModel';

export * from './productModel';
export * from './productInput';

// Windsor Beauty keeps its whole catalogue in the database, so every product can
// be added, edited or removed in Admin > Products with no code change. This
// built-in list is therefore empty on purpose. The starter products that fill a
// brand-new shop live in ./starterProducts.ts and are copied in once by
// "Run Database Setup".
export const PRODUCTS: Product[] = [];
