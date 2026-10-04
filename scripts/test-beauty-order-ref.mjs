// Exact Beauty parser proof, no database or network.
import assert from 'node:assert/strict';
import { findOrderRef } from '../src/lib/replyCapture.ts';
for(const [input,want] of [['Order WB-GCZBKK','WB-GCZBKK'],['Reply: wb-4293ur-85a64 please','WB-4293UR-85A64'],['WG-GCZBKK',null],['WG-GCZBKK and WB-ABCD','WB-ABCD'],['XWB-GCZBKK',null],['WB-ABC',null],['hello',null],['WB-ABCD and WB-EFGH','WB-ABCD']])assert.equal(findOrderRef(input),want,input);
console.log('PASS: 8 Beauty WB reference cases; Glow WG cannot be attributed to a Beauty order. No data writes.');
