const xlsx = require('xlsx');
const slugify = require('slugify');

const STRAPI_URL = process.env.STRAPI_URL || 'http://localhost:1337';
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN || '42b9b1907f1687cad3cfd7d05e679e38a961d3c1be58e6960d6d8e887cd739032d2302d3b58e1797c3ae8ccbdef8c39b74a87ccf57f5498e1f5a49635f01701e3e2a5ea8f2a3af096cabd443e2aff7ca4b694a24ec17cf98614f6449163247723820c13ef12b5defd6b33f87b3a07c7dca4ead7bfb5e112218fa797698af1ba7';
const FILE_PATH = '/Users/greck/Desktop/agraris/agraris-cms/scripts/export-products-29-03-26_02-25-56.xlsx';

function makeSlug(value) {
    return slugify(String(value || ''), {
        lower: true,
        strict: true,
        locale: 'ru',
        trim: true,
    });
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

function normalizeBrandName(value) {
    return String(value || '').trim();
}

function isIgnoredBrand(value) {
    const v = String(value || '').trim().toLowerCase();
    return !v || v === 'не указан производитель';
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
        throw new Error(`Request failed: ${res.status} ${res.statusText}\n${JSON.stringify(data, null, 2)}`);
    }

    return data;
}

async function getExistingBrands() {
    const json = await strapiRequest('/api/brands?pagination[pageSize]=500');
    return json.data || [];
}

async function createBrand(payload) {
    return strapiRequest('/api/brands', {
        method: 'POST',
        body: JSON.stringify({ data: payload }),
    });
}

async function main() {
    console.log('📘 Reading XLSX...');
    const workbook = xlsx.readFile(FILE_PATH);

    // Берём основной лист с товарами, а не Groups Sheet
    const productSheetName = workbook.SheetNames.find(
        (name) => name !== 'Export Groups Sheet'
    );

    if (!productSheetName) {
        throw new Error('Could not find products sheet in workbook.');
    }

    const sheet = workbook.Sheets[productSheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

    console.log(`Using products sheet: ${productSheetName}`);
    console.log(`Rows: ${rows.length}`);

    const uniqueBrands = new Map();

    for (const row of rows) {
        const rawBrand =
            row['Производитель'] ||
            row['Название_производителя'] ||
            '';

        const brandName = normalizeBrandName(rawBrand);

        if (isIgnoredBrand(brandName)) continue;

        if (!uniqueBrands.has(brandName.toLowerCase())) {
            uniqueBrands.set(brandName.toLowerCase(), brandName);
        }
    }

    const brandsToCreate = Array.from(uniqueBrands.values()).sort((a, b) =>
        a.localeCompare(b, 'ru')
    );

    console.log(`Prepared brands: ${brandsToCreate.length}`);

    const existing = await getExistingBrands();
    const existingNames = new Set(
        existing.map((item) => String(item.name || '').trim().toLowerCase())
    );

    let createdCount = 0;
    let skippedCount = 0;

    for (const brandName of brandsToCreate) {
        const key = brandName.toLowerCase();

        if (existingNames.has(key)) {
            console.log(`↪ Exists: ${brandName}`);
            skippedCount++;
            continue;
        }

        const payload = {
            name: brandName,
            sortOrder: null,
            isActive: true,
        };

        await createBrand(payload);
        console.log(`✅ Created: ${brandName}`);
        createdCount++;
    }

    console.log('🎉 Brands import finished.');
    console.log(`Created: ${createdCount}`);
    console.log(`Skipped: ${skippedCount}`);
}

main().catch((err) => {
    console.error('❌ Import failed');
    console.error(err);
    process.exit(1);
});