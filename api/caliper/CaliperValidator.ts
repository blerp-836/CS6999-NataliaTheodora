import fs from 'fs-extra';
import path from 'path';
import addFormats from 'ajv-formats';
import AjvDraft04 from 'ajv-draft-04';

interface ValidationError {
  type: 'envelope' | 'event';
  index?: number;
  /* eslint-disable  @typescript-eslint/no-explicit-any */
  errors: any[];
}

class CaliperValidator {
  private ajv: AjvDraft04;

  constructor(schemasDir?: string) {
    if (!schemasDir) {
      throw new Error('schemasDir is not set');
    }

    this.ajv = new AjvDraft04({ strict: false });
    addFormats(this.ajv);
    this.addCustomFormats();
    this.loadSchemas(schemasDir);
  }

  private addCustomFormats() {
    this.ajv.addFormat("uint32", {
      type: "number",
      validate: (x: number) => Number.isInteger(x) && x >= 0 && x <= 4294967295,
    });

    this.ajv.addFormat("long", {
      type: "number",
      validate: (x: number) => Number.isInteger(x) && x >= -9223372036854775808 && x <= 9223372036854775807,
    });
  }

  private loadSchemas(dirPath: string) {
    const files = fs.readdirSync(dirPath);
    const jsonFiles = files.filter(file => file.endsWith('.json'));

    for (const file of jsonFiles) {
      const filePath = path.join(dirPath, file);
      const schemaContent = fs.readJSONSync(filePath);

      if (!schemaContent.$id) {
        schemaContent.$id = path.basename(file, '.json');
      }

      this.ajv.addSchema(schemaContent, schemaContent.$id);
    }
    console.log('All schemas loaded successfully.');
  }

  public validateEnvelopeAndEvents(data: any): ValidationError[] {
    const validationErrors: ValidationError[] = [];

    // Validate envelope
    const envelopeSchemaId = 'Envelope';
    const validateEnvelope = this.ajv.getSchema(envelopeSchemaId);

    if (!validateEnvelope) {
      validationErrors.push({
        type: 'envelope',
        errors: [`Schema ${envelopeSchemaId} could not be retrieved or is undefined.`]
      });
      return validationErrors;
    }

    const isEnvelopeValid = validateEnvelope(data);
    if (!isEnvelopeValid) {
      validationErrors.push({
        type: 'envelope',
        errors: validateEnvelope.errors || []
      });
      // Stop further validation if envelope structure is invalid
      return validationErrors;
    }

    // Validate events
    const dataArray = data.data;
    if (!Array.isArray(dataArray)) {
      validationErrors.push({
        type: 'envelope',
        errors: [`Data does not contain a valid 'data' array`]
      });
      return validationErrors;
    }

    for (const [index, event] of dataArray.entries()) {
      const eventType = event.type;
      if (!eventType) {
        validationErrors.push({
          type: 'event',
          index,
          errors: [`Event is missing 'type' field`]
        });
        continue;
      }

      const eventSchemaId = eventType;
      const validateEvent = this.ajv.getSchema(eventSchemaId);

      if (!validateEvent) {
        validationErrors.push({
          type: 'event',
          index,
          errors: [`Schema ${eventSchemaId} could not be retrieved for event.`]
        });
        continue;
      }

      const isEventValid = validateEvent(event);
      if (!isEventValid) {
        validationErrors.push({
          type: 'event',
          index,
          errors: validateEvent.errors || []
        });
      }
    }

    return validationErrors;
  }
}

export default CaliperValidator;
