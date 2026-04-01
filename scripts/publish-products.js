const xlsx = require('xlsx');

const STRAPI_URL = process.env.STRAPI_URL || 'http://localhost:1337';
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN || '42b9b1907f1687cad3cfd7d05e679e38a961d3c1be58e6960d6d8e887cd739032d2302d3b58e1797c3ae8ccbdef8c39b74a87ccf57f5498e1f5a49635f01701e3e2a5ea8f2a3af096cabd443e2aff7ca4b694a24ec17cf98614f6449163247723820c13ef12b5defd6b33f87b3a07c7dca4ead7bfb5e112218fa797698af1ba7';
const FILE_PATH = '/Users/greck/Desktop/agraris/agraris-cms/scripts/export-products-29-03-26_15-42-21.xlsx';

function normalizeText(value) {
    return String(value || '').trim();
}

async function getAllEntries(basePath) {
    let page = 1;
    let pageCount = 1;
    const results = [];

    while (page <= pageCount) {
        const separator = basePath.includes('?') ? '&' : '?';
        const path = `${basePath}${separator}pagination[page]=${page}&pagination[pageSize]=100`;

        const json = await strapiRequest(path);
        const data = json.data || [];
        const pagination = json.meta?.pagination;

        results.push(...data);

        pageCount = pagination?.pageCount || 1;
        page++;
    }

    return results;
}

async function strapiRequest(path, options = {}) {
    const res = await fetch(`${STRAPI_URL}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${STRAPI_API_TOKEN}`,
            ...(options.headers || {}),
        },
    });

    const text = await res.text();
    let data = {};
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = { raw: text };
    }

    if (!res.ok) {
        throw new Error(
            `Request failed: ${res.status} ${res.statusText}\n${JSON.stringify(data, null, 2)}`
        );
    }

    return data;
}

async function getAllProducts() {
    return getAllEntries('/api/products');
}

async function updateProduct(documentId, payload) {
    return strapiRequest(`/api/products/${documentId}`, {
        method: 'PUT',
        body: JSON.stringify({ data: payload }),
    });
}

async function main() {
    console.log('📘 Reading published products XLSX...');
    const workbook = xlsx.readFile(FILE_PATH);
    const sheet = workbook.Sheets['Export Products Sheet'];

    if (!sheet) {
        throw new Error('Sheet "Export Products Sheet" not found.');
    }

    const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
    console.log(`Rows: ${rows.length}`);

    const allProducts = await getAllProducts();

    const productBySku = new Map();
    const productBySourceUrl = new Map();
    const productByTitle = new Map();

    for (const product of allProducts) {
        const sku = normalizeText(product.sku);
        const sourceUrl = normalizeText(product.sourceUrl);
        const title = normalizeText(product.title).toLowerCase();

        if (sku) productBySku.set(sku, product);
        if (sourceUrl) productBySourceUrl.set(sourceUrl, product);

        if (title) {
            if (!productByTitle.has(title)) {
                productByTitle.set(title, []);
            }
            productByTitle.get(title).push(product);
        }
    }

    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
        const sku = normalizeText(row['Код_товара']);
        const title = normalizeText(row['Название_позиции']);
        const sourceUrl = normalizeText(row['Продукт_на_сайте']);

        let product = null;

        if (sourceUrl && productBySourceUrl.has(sourceUrl)) {
            product = productBySourceUrl.get(sourceUrl);
        } else if (sku && productBySku.has(sku)) {
            product = productBySku.get(sku);
        } else if (title) {
            const candidates = productByTitle.get(title.toLowerCase()) || [];
            if (candidates.length === 1) {
                product = candidates[0];
            } else if (candidates.length > 1) {
                console.log(`⚠️ Ambiguous title match: ${title}`);
                skipped++;
                continue;
            }
        }

        if (!product) {
            console.log(`⚠️ Not found: ${title}${sourceUrl ? ` | ${sourceUrl}` : ''}`);
            skipped++;
            continue;
        }

        await updateProduct(product.documentId, {
            isActive: true,
        });

        console.log(`✅ Published: ${title}`);
        updated++;
    }

    console.log('🎉 Published products update finished.');
    console.log(`Updated: ${updated}`);
    console.log(`Skipped: ${skipped}`);
}

main().catch((err) => {
    console.error('❌ Script failed');
    console.error(err);
    process.exit(1);
});