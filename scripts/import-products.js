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

function makeUniqueSlug(title, sku, usedSlugs) {
    const baseSlug = makeSlug(title);

    if (!usedSlugs.has(baseSlug)) {
        usedSlugs.add(baseSlug);
        return baseSlug;
    }

    if (sku) {
        const skuSlug = `${baseSlug}-${makeSlug(sku)}`;
        if (!usedSlugs.has(skuSlug)) {
            usedSlugs.add(skuSlug);
            return skuSlug;
        }
    }

    let counter = 2;
    while (true) {
        const candidate = `${baseSlug}-${counter}`;
        if (!usedSlugs.has(candidate)) {
            usedSlugs.add(candidate);
            return candidate;
        }
        counter++;
    }
}

function normalizeText(value) {
    return String(value || '').trim();
}

function normalizeNumber(value) {
    if (value === null || value === undefined || value === '') return null;

    const str = String(value).replace(/\s/g, '').replace(',', '.');
    const num = Number(str);

    return Number.isNaN(num) ? null : num;
}

function mapAvailability(value) {
    if (!value && value !== 0) return null;

    const raw = String(value).trim().toLowerCase();

    if (!isNaN(raw)) {
        const num = Number(raw);
        if (num > 0) return 'in_stock';
        if (num === 0) return 'out_of_stock';
    }

    if (raw === '+' || raw.includes('в наличии')) return 'in_stock';
    if (raw === '-' || raw.includes('нет')) return 'out_of_stock';
    if (raw.includes('под заказ')) return 'on_request';

    return 'on_request';
}

function mapSaleType(value) {
    const v = normalizeText(value).toLowerCase();

    if (v === 'r') return 'retail';
    if (v === 'w') return 'wholesale';
    if (v === 'u') return 'both';

    return 'both';
}

function buildSpecs(row) {
    const specs = {};

    Object.keys(row).forEach((key) => {
        if (!key.startsWith('Название_Характеристики')) return;

        const suffix = key.replace('Название_Характеристики', '');
        const valueKey = `Значение_Характеристики${suffix}`;
        const unitKey = `Измерение_Характеристики${suffix}`;

        const name = normalizeText(row[key]);
        const value = normalizeText(row[valueKey]);
        const unit = normalizeText(row[unitKey]);

        if (name && value) {
            specs[name] = unit ? `${value} ${unit}`.trim() : value;
        }
    });

    return Object.keys(specs).length ? specs : null;
}

function extractPower(specs) {
    if (!specs) return null;

    const possibleKeys = [
        'Мощность двигателя',
        'Мощность',
        'Номинальная мощность',
    ];

    for (const key of possibleKeys) {
        if (specs[key]) return specs[key];
    }

    return null;
}

function mapCategoryType(categoryName) {
    const v = normalizeText(categoryName).toLowerCase();

    if (v.includes('б/у')) return 'used';
    if (v.includes('нов')) return 'new';
    if (v.includes('запчаст')) return 'parts';

    return null;
}

function buildConditionLabel(categoryType, row, specs) {
    if (specs && specs['Состояние']) {
        return specs['Состояние'];
    }

    if (categoryType === 'new') return 'Новая';

    if (categoryType === 'used') {
        const year =
            normalizeNumber(row['Год выпуска']) || normalizeNumber(row['Год']);
        if (year) return `Б/У, ${year} г.`;
        return 'Б/У';
    }

    if (categoryType === 'parts') return 'Запчасти';

    return null;
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

async function getAllCategories() {
    const json = await strapiRequest('/api/categories?pagination[pageSize]=500');
    return json.data || [];
}

async function getAllBrands() {
    const json = await strapiRequest('/api/brands?pagination[pageSize]=500');
    return json.data || [];
}

async function getAllProducts() {
    const json = await strapiRequest('/api/products?pagination[pageSize]=500');
    return json.data || [];
}

async function createProduct(payload) {
    return strapiRequest('/api/products', {
        method: 'POST',
        body: JSON.stringify({ data: payload }),
    });
}

async function main() {
    console.log('📘 Reading XLSX...');
    const workbook = xlsx.readFile(FILE_PATH);
    const sheet = workbook.Sheets['Export Products Sheet'];

    if (!sheet) {
        throw new Error('Sheet "Export Products Sheet" not found.');
    }

    const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
    console.log(`Rows: ${rows.length}`);

    const [categories, brands, existingProducts] = await Promise.all([
        getAllCategories(),
        getAllBrands(),
        getAllProducts(),
    ]);

    const categoryByName = new Map(
        categories.map((item) => [normalizeText(item.name).toLowerCase(), item])
    );

    const brandByName = new Map(
        brands.map((item) => [normalizeText(item.name).toLowerCase(), item])
    );

    const existingBySku = new Map(
        existingProducts
            .filter((item) => item.sku)
            .map((item) => [normalizeText(item.sku), item])
    );

    const usedSlugs = new Set(
        existingProducts
            .map((item) => normalizeText(item.slug))
            .filter(Boolean)
    );

    let createdCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const row of rows) {
        const title = normalizeText(row['Название_позиции']);
        const sku = normalizeText(row['Код_товара']);
        const categoryName = normalizeText(row['Название_группы']);

        const rawBrandName = normalizeText(
            row['Производитель'] || row['Название_производителя']
        );

        const brandName =
            rawBrandName.toLowerCase() === 'не указан производитель'
                ? ''
                : rawBrandName;

        if (!title) {
            console.log('⚠️ Skip row without title');
            skippedCount++;
            continue;
        }

        if (sku && existingBySku.has(sku)) {
            console.log(`↪ Exists by SKU: ${title}`);
            skippedCount++;
            continue;
        }

        const specs = buildSpecs(row);
        const categoryType = mapCategoryType(categoryName);
        const conditionLabel = buildConditionLabel(categoryType, row, specs);
        const power = extractPower(specs);

        const category = categoryByName.get(categoryName.toLowerCase()) || null;
        const brand = brandName
            ? brandByName.get(brandName.toLowerCase()) || null
            : null;

        const slug = makeUniqueSlug(title, sku, usedSlugs);

        const payload = {
            title,
            slug,
            description: normalizeText(row['Описание']) || null,
            shortDescription: normalizeText(row['Краткое_описание']) || null,
            priceBase: normalizeNumber(row['Цена']),
            priceFrom: normalizeNumber(row['Цена_от']),
            baseCurrency: normalizeText(row['Валюта']) || 'EUR',
            availability: mapAvailability(row['Наличие']),
            year: normalizeNumber(row['Год выпуска']) || normalizeNumber(row['Год']),
            country: normalizeText(row['Страна_производитель']) || null,
            featured: false,
            isActive: false,
            specs,
            category: category ? category.documentId : null,
            brand: brand ? brand.documentId : null,
            power,
            conditionLabel,
            mainImage: null,
            sku: sku || null,
            sourceUrl: normalizeText(row['Продукт_на_сайте']) || null,
            searchKeywords: normalizeText(row['Поисковые_запросы']) || null,
            unit: normalizeText(row['Единица_измерения']) || null,
            quantity: normalizeNumber(row['Количество']),
            metaTitle: normalizeText(row['HTML_заголовок']) || null,
            metaDescription: normalizeText(row['HTML_описание']) || null,
            supplierName: normalizeText(row['Название_поставщика']) || null,
            supplierAddress: normalizeText(row['Адрес_поставщика']) || null,
            manufacturer: brandName || null,
            manufacturerAddress: normalizeText(row['Адрес_производителя']) || null,
            warranty: normalizeText(row['Гарантийный_срок']) || null,
            deliveryTime: normalizeText(row['Срок_поставки']) || null,
            wholesaleMinOrder: normalizeNumber(
                row['Минимальный_объем_заказа'] || row['Минимальный_заказ_опт']
            ),
            wholesalePrice: normalizeNumber(row['Оптовая_цена']),
            saleType: mapSaleType(row['Тип_товара']),
            images: [],
        };

        try {
            await createProduct(payload);
            console.log(`✅ Created: ${title} -> ${slug}`);
            createdCount++;
        } catch (error) {
            console.error(`❌ Failed: ${title}`);
            console.error(error.message);
            failedCount++;
        }
    }

    console.log('🎉 Products import finished.');
    console.log(`Created: ${createdCount}`);
    console.log(`Skipped: ${skippedCount}`);
    console.log(`Failed: ${failedCount}`);
}

main().catch((err) => {
    console.error('❌ Import failed');
    console.error(err);
    process.exit(1);
});