import fs from 'fs-extra';
import path from 'path';
import addFormats from 'ajv-formats';
import AjvDraft04 from 'ajv-draft-04';

const ajv = new AjvDraft04({ strict: false });
addFormats(ajv);

// There are a few custom formats in the schemas that are not supported by ajv-formats 
ajv.addFormat("uint32", {
  type: "number",
  validate: (x: number) => Number.isInteger(x) && x >= 0 && x <= 4294967295,
});

ajv.addFormat("long", {
  type: "number",
  validate: (x: number) => Number.isInteger(x) && x >= -9223372036854775808 && x <= 9223372036854775807,
});

// Function to load schemas and add them to Ajv
const loadSchemas = async (dirPath: string) => {
  const files = await fs.readdir(dirPath);
  const jsonFiles = files.filter(file => file.endsWith('.json'));

  for (const file of jsonFiles) {
    const filePath = path.join(dirPath, file);
    const schemaContent = await fs.readJSON(filePath);

    if (!schemaContent.$id) {
      schemaContent.$id = path.basename(file, '.json'); 
    }

    ajv.addSchema(schemaContent, schemaContent.$id);
  }
};

const validateEnvelopeAndEvents = async (exampleFile: string) => {
  const examplePath = path.join(__dirname, './examples', exampleFile);
  const exampleData = await fs.readJSON(examplePath);

  // Caliper events are wrapped into an envelope structure - so we need to validate the envelope first,  then each event
  // Step 1: Validate the envelope structure
  const envelopeSchemaId = 'Envelope'; // Assumes the envelope schema is registered with this ID
  const validateEnvelope = ajv.getSchema(envelopeSchemaId);

  if (!validateEnvelope) {
    console.error(` -: Schema ${envelopeSchemaId} could not be retrieved or is undefined.`);
    return;
  }

  const isEnvelopeValid = validateEnvelope(exampleData);
  console.log(` Validating ${exampleFile} against schema ${envelopeSchemaId}:`);
  if (!isEnvelopeValid) {
    console.error(` -: ❌ ${exampleFile} envelope validation errors:`, validateEnvelope.errors);
    return; // Stop further validation if envelope structure is invalid
  } else {
    console.log(` -: ✅ ${exampleFile} envelope structure is valid`);
  }

  // Step 2: Validate each event in the data array
  const dataArray = exampleData.data;
  if (!Array.isArray(dataArray)) {
    console.error(` -: ❌ ${exampleFile} does not contain a valid 'data' array`);
    return;
  }

  for (const [index, event] of dataArray.entries()) {
    const eventType = event.type;
    if (!eventType) {
      console.warn(` -: ❌ Event at index ${index} is missing 'type' field`);
      continue;
    }

    const eventSchemaId = eventType; 
    const validateEvent = ajv.getSchema(eventSchemaId);

    if (!validateEvent) {
      console.error(` -: Schema ${eventSchemaId} could not be retrieved for event at index ${index}.`);
      continue;
    }

    const isEventValid = validateEvent(event);
    console.log(` Validating event at index ${index} against schema ${eventSchemaId}:`);
    if (isEventValid) {
      console.log(` -: ✅ Event at index ${index} is valid`);
    } else {
      console.error(` -: ❌ Event at index ${index} validation errors:`, validateEvent.errors);
    }
  }
};

const schemasDir = path.resolve(__dirname, '../../../api/json-schema/caliper/v1_2');
const examplesDir = path.resolve(__dirname, './examples');

const main = async () => {
  await loadSchemas(schemasDir);

  const files = await fs.readdir(examplesDir);
  const jsonFiles = files.filter(file => file.endsWith('.json'));

  for (const exampleFile of jsonFiles) {
    console.log(`\nValidating ${exampleFile}...`);
    await validateEnvelopeAndEvents(exampleFile);
    console.log('\n----------------------------------');
  }
};

main().catch(console.error);
