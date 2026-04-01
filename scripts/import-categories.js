const xlsx = require('xlsx');
const slugify = require('slugify');

const STRAPI_URL = process.env.STRAPI_URL || 'http://localhost:1337';
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN || '42b9b1907f1687cad3cfd7d05e679e38a961d3c1be58e6960d6d8e887cd739032d2302d3b58e1797c3ae8ccbdef8c39b74a87ccf57f5498e1f5a49635f01701e3e2a5ea8f2a3af096cabd443e2aff7ca4b694a24ec17cf98614f6449163247723820c13ef12b5defd6b33f87b3a07c7dca4ead7bfb5e112218fa797698af1ba7';

// Укажи путь к твоему xlsx файлу
const FILE_PATH = '/Users/greck/Desktop/agraris/agraris-cms/scripts/export-products-29-03-26_02-25-56.xlsx';

// Здесь вручную фиксируем корневые группы и их тип
const ROOT_CATEGORY_TYPE_MAP = {
    'Сельскохозяйственная техника новая': 'new',
    'Сельхозтехника б/у': 'used',
    'Запасные части для сельскохозяйственной техники': 'parts',
    'Запчасти Grimme': 'parts',
};

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

function makeSlug(value) {
    return slugify(String(value || ''), {
        lower: true,
        strict: true,
        locale: 'ru',
        trim: true,
    });
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

function getRootCategoryType(name) {
    return ROOT_CATEGORY_TYPE_MAP[name] || 'general';
}

async function getExistingCategories() {
    const json = await strapiRequest('/api/categories?pagination[pageSize]=500&populate=parent');
    return json.data || [];
}

async function createCategory(payload) {
    return strapiRequest('/api/categories', {
        method: 'POST',
        body: JSON.stringify({ data: payload }),
    });
}

async function updateCategory(documentId, payload) {
    return strapiRequest(`/api/categories/${documentId}`, {
        method: 'PUT',
        body: JSON.stringify({ data: payload }),
    });
}

function normalizeGroupName(value) {
    return String(value || '').trim();
}

async function main() {
    console.log('📘 Reading XLSX...');
    const workbook = xlsx.readFile(FILE_PATH);

    const groupsSheetName = workbook.SheetNames.find((name) =>
        name.toLowerCase().includes('group')
    );

    if (!groupsSheetName) {
        throw new Error('Could not find groups sheet in workbook.');
    }

    const sheet = workbook.Sheets[groupsSheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

    console.log(`Found groups sheet: ${groupsSheetName}`);
    console.log(`Rows: ${rows.length}`);

    // Попробуем угадать нужные поля из выгрузки
    // После первого запуска, если названия колонок отличаются, подправим
    const mappedRows = rows.map((row) => {
        const sourceId =
            row['Номер_группы'] ||
            row['ID группы'] ||
            row['ID_группы'] ||
            row['group_id'] ||
            '';

        const name =
            row['Название_группы'] ||
            row['Группа'] ||
            row['name'] ||
            '';

        const parentId =
            row['Родительская_группа'] ||
            row['Номер_родительской_группы'] ||
            row['parent_id'] ||
            '';

        const description =
            row['Описание_группы_до_списка_товарных_позиций'] ||
            row['Описание_группы'] ||
            '';

        const metaTitle =
            row['HTML_заголовок_группы'] ||
            row['HTML_заголовок'] ||
            '';

        const metaDescription =
            row['HTML_описание_группы'] ||
            row['HTML_описание'] ||
            '';

        return {
            sourceId: String(sourceId).trim(),
            name: normalizeGroupName(name),
            parentSourceId: String(parentId).trim(),
            description: String(description || '').trim(),
            metaTitle: String(metaTitle || '').trim(),
            metaDescription: String(metaDescription || '').trim(),
        };
    }).filter((row) => row.name);

    console.log(`Prepared categories: ${mappedRows.length}`);

    const existing = await getExistingCategories();

    // Индексы для быстрых проверок
    const bySourceId = new Map();
    const byName = new Map();

    for (const item of existing) {
        const attrs = item;
        if (attrs.sourceId) bySourceId.set(String(attrs.sourceId), item);
        if (attrs.name) byName.set(String(attrs.name).trim(), item);
    }

    const createdOrExisting = new Map();

    console.log('🛠 Step 1: create categories without parents...');

    for (const row of mappedRows) {
        let found = null;

        if (row.sourceId && bySourceId.has(row.sourceId)) {
            found = bySourceId.get(row.sourceId);
        } else if (byName.has(row.name)) {
            found = byName.get(row.name);
        }

        if (found) {
            createdOrExisting.set(row.sourceId || row.name, found);
            console.log(`↪ Exists: ${row.name}`);
            continue;
        }

        const payload = {
            name: row.name,
            slug: makeSlug(row.name),
            description: row.description || null,
            shortDescription: null,
            sortOrder: null,
            isActive: true,
            categoryType: getRootCategoryType(row.name),
            sourceId: row.sourceId || null,
            metaTitle: row.metaTitle || null,
            metaDescription: row.metaDescription || null,
        };

        const created = await createCategory(payload);
        const entity = created.data;
        createdOrExisting.set(row.sourceId || row.name, entity);

        if (row.sourceId) bySourceId.set(row.sourceId, entity);
        byName.set(row.name, entity);

        console.log(`✅ Created: ${row.name}`);
    }

    console.log('🔗 Step 2: link parent categories...');

    for (const row of mappedRows) {
        if (!row.parentSourceId) continue;

        const current =
            createdOrExisting.get(row.sourceId || row.name) ||
            bySourceId.get(row.sourceId) ||
            byName.get(row.name);

        const parent =
            createdOrExisting.get(row.parentSourceId) ||
            bySourceId.get(row.parentSourceId);

        if (!current || !parent) {
            console.warn(`⚠️ Parent link skipped: ${row.name} (parentSourceId=${row.parentSourceId})`);
            continue;
        }

        const payload = {
            parent: parent.documentId,
            categoryType: parent.categoryType || getRootCategoryType(parent.name),
        };

        await updateCategory(current.documentId, payload);
        console.log(`🔗 Linked: ${row.name} -> ${parent.name}`);
    }

    console.log('🎉 Categories import finished.');
}

main().catch((err) => {
    console.error('❌ Import failed');
    console.error(err);
    process.exit(1);
});