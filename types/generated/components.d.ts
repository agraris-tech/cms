import type { Schema, Struct } from '@strapi/strapi';

export interface SharedRegionalContact extends Struct.ComponentSchema {
  collectionName: 'components_shared_regional_contacts';
  info: {
    displayName: 'Regional Contact';
    icon: 'collapse';
  };
  attributes: {
    addressShort: Schema.Attribute.String;
    callbackButtonText: Schema.Attribute.String;
    email: Schema.Attribute.String;
    fullAddress: Schema.Attribute.String;
    mapEmbedUrl: Schema.Attribute.Text;
    mapExternalUrl: Schema.Attribute.String;
    mapType: Schema.Attribute.Enumeration<['google', 'yandex']>;
    phone: Schema.Attribute.String;
    telegramUrl: Schema.Attribute.String;
    whatsappUrl: Schema.Attribute.String;
    workingHours: Schema.Attribute.String;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'shared.regional-contact': SharedRegionalContact;
    }
  }
}
