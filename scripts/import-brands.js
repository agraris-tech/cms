const xlsx = require('xlsx');
const slugify = require('slugify');

const STRAPI_URL = process.env.STRAPI_URL || 'http://localhost:1337';
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN || '2c47d8f2c579d9c64e5e7c4a66a7eacb75b34f870ea9353452eab5b4dd124254b0ea033c363fb53f7eff77a09c28a895d600ef0abfb679bd3ff352eb85d0f21a65f803c10b662c13d0b8e9d45e1f7695f545f7436f6174d9879f54573d37545583fa0387f53640acd6d88f661fcef8b4c3c7426e3376a65519dad95fc3c9aad5';
const FILE_PATH = '/Users/greck/Desktop/AgrarisFinal/cms/scripts/export-products-29-03-26_02-25-56.xlsx';

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