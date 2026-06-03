const xlsx = require('xlsx');

const STRAPI_URL = process.env.STRAPI_URL || 'http://localhost:1337';
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN || '2c47d8f2c579d9c64e5e7c4a66a7eacb75b34f870ea9353452eab5b4dd124254b0ea033c363fb53f7eff77a09c28a895d600ef0abfb679bd3ff352eb85d0f21a65f803c10b662c13d0b8e9d45e1f7695f545f7436f6174d9879f54573d37545583fa0387f53640acd6d88f661fcef8b4c3c7426e3376a65519dad95fc3c9aad5';
const FILE_PATH = '/Users/greck/Desktop/AgrarisFinal/cms/scripts/export-products-29-03-26_02-25-56.xlsx';

function normalizeId(value) {
    if (value === null || value === undefined || value === '') return '';
    return String(value).replace(/\.0$/, '').trim();
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
        throw new Error(`Request failed: ${res.status} ${res.statusText}\n${JSON.stringify(data, null, 2)}`);
    }

    return data;
}

async function getCategories() {
    const json = await strapiRequest('/api/categories?pagination[pageSize]=500');
    return json.data || [];
}

async function updateCategory(documentId, payload) {
    return strapiRequest(`/api/categories/${documentId}`, {
        method: 'PUT',
        body: JSON.stringify({ data: payload }),
    });
}

async function main() {
    const workbook = xlsx.readFile(FILE_PATH);
    const sheet = workbook.Sheets['Export Groups Sheet'];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

    const mappedRows = rows.map((row) => ({
        sourceId: normalizeId(row['Номер_группы']),
        name: String(row['Название_группы'] || '').trim(),
        parentSourceId: normalizeId(row['Номер_родителя'] || row['Идентификатор_родителя']),
    }));

    const categories = await getCategories();

    const bySourceId = new Map();
    for (const cat of categories) {
        if (cat.sourceId) {
            bySourceId.set(String(cat.sourceId).trim(), cat);
        }
    }

    for (const row of mappedRows) {
        if (!row.parentSourceId) continue;

        const current = bySourceId.get(row.sourceId);
        const parent = bySourceId.get(row.parentSourceId);

        if (!current || !parent) {
            console.log(`⚠️ Skip: ${row.name} | current=${!!current} parent=${!!parent}`);
            continue;
        }

        await updateCategory(current.documentId, {
            parent: parent.documentId,
        });

        console.log(`🔗 ${row.name} -> ${parent.name}`);
    }

    console.log('✅ Parent links completed');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});