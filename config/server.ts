import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Server => ({
    host: env('HOST', '0.0.0.0'),
    port: env.int('PORT', 1337),
    app: {
        keys: env.array('APP_KEYS'),
    },
    cron: {
        enabled: true,
        tasks: {
            '0 5 0 * * *': async ({ strapi }) => {
                try {
                    console.log('Running daily exchange rates update...');

                    const response = await fetch(
                        'https://v6.exchangerate-api.com/v6/dc12709400e3cc60a5964d45/latest/EUR'
                    );

                    const data = (await response.json()) as {
                        result: string;
                        conversion_rates: {
                            RUB: number;
                            KZT: number;
                            BYN: number;
                        };
                    };

                    if (data.result !== 'success') {
                        throw new Error('Failed to fetch exchange rates');
                    }

                    const rubRate = data.conversion_rates.RUB;
                    const kztRate = data.conversion_rates.KZT;
                    const bynRate = data.conversion_rates.BYN;

                    const existing = await strapi
                        .documents('api::currency-rate.currency-rate')
                        .findFirst();

                    if (existing) {
                        await strapi
                            .documents('api::currency-rate.currency-rate')
                            .update({
                                documentId: existing.documentId,
                                data: {
                                    baseCurrency: 'EUR',
                                    rubRate,
                                    kztRate,
                                    bynRate,
                                    sourceName: 'exchangerate.host',
                                    updatedAtExternal: new Date().toISOString(),
                                },
                            });
                    } else {
                        await strapi
                            .documents('api::currency-rate.currency-rate')
                            .create({
                                data: {
                                    baseCurrency: 'EUR',
                                    rubRate,
                                    kztRate,
                                    bynRate,
                                    sourceName: 'exchangerate.host',
                                    updatedAtExternal: new Date().toISOString(),
                                },
                            });
                    }

                    console.log('Exchange rates updated successfully');
                } catch (error) {
                    console.error('Exchange rates update failed:', error);
                }
            },
        },
    },
});

export default config;