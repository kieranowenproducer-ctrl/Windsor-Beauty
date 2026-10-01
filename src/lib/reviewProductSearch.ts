export interface ReviewFilterProduct {
  slug: string;
  name: string;
  categories: string[];
  keywords: string[];
  brand?: string;
}

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function editDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array<number>(b.length + 1);

  for (let aIndex = 1; aIndex <= a.length; aIndex += 1) {
    current[0] = aIndex;
    for (let bIndex = 1; bIndex <= b.length; bIndex += 1) {
      current[bIndex] = Math.min(
        current[bIndex - 1] + 1,
        previous[bIndex] + 1,
        previous[bIndex - 1] + (a[aIndex - 1] === b[bIndex - 1] ? 0 : 1),
      );
    }
    for (let index = 0; index < current.length; index += 1) previous[index] = current[index];
  }

  return previous[b.length];
}

function tokenMatches(queryToken: string, candidateToken: string): boolean {
  if (candidateToken.includes(queryToken)) return true;
  if (queryToken.length < 4 || candidateToken.length < 4) return false;
  return editDistance(queryToken, candidateToken) <= 1;
}

export function reviewProductMatches(product: ReviewFilterProduct, rawQuery: string): boolean {
  const query = normalize(rawQuery);
  if (!query) return true;

  const fields = [product.name, product.brand, ...product.categories, ...product.keywords]
    .filter((value): value is string => Boolean(value))
    .map(normalize);
  const combined = fields.join(' ');
  if (combined.includes(query)) return true;

  const compactQuery = query.replace(/\s/g, '');
  if (compactQuery.length >= 3 && fields.some(field => field.replace(/\s/g, '').includes(compactQuery))) {
    return true;
  }

  const candidateTokens = combined.split(' ').filter(Boolean);
  return query.split(' ').every(queryToken =>
    candidateTokens.some(candidateToken => tokenMatches(queryToken, candidateToken))
  );
}
