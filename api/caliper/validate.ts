import CaliperValidator from './CaliperValidator';
import * as path from 'path';
import fs from 'fs-extra';

const examplesDir = path.resolve(__dirname, './examples');

export const main = async () => {
  const files = await fs.readdir(examplesDir);
  const jsonFiles = files.filter(file => file.endsWith('.json'));

  const caliperv11SchemaDir = '../json-schema/caliper/v1_1';
  const validatorv11 = new CaliperValidator(caliperv11SchemaDir);

  const caliperv12SchemaDir = '../json-schema/caliper/v1_2';
  const validatorv12 = new CaliperValidator(caliperv12SchemaDir);

  for (const exampleFile of jsonFiles) {

    const examplePath = path.join(__dirname, './examples', exampleFile);
    const exampleData = await fs.readJSON(examplePath);
    console.log('dataVersion: ' + exampleData.dataVersion);

    const version = exampleData.dataVersion;
    // if the version contains v1p1
    if (version.includes('v1p1')) {
      console.log('v1p1');
    } else if (version.includes('v1p2')) {
      console.log('v1p2');
    }

    for (const [index, event] of exampleData.data.entries()) {
      const eventType = event.type;
      console.log('eventType: ' + eventType);
    }

    console.log(`\nValidating ${exampleFile}...`);
    //await validatorv11.validateEnvelopeAndEvents(exampleData);
    //await validatorv12.validateEnvelopeAndEvents(exampleData);

    const validationErrors = validatorv11.validateEnvelopeAndEvents(exampleData);

    if (validationErrors.length === 0) {
      console.log('Validation passed. No errors found.');
    } else {
      console.log('Validation failed. Errors:', JSON.stringify(validationErrors,null,2));
    }

    console.log('\n----------------------------------');
  }
};

main().catch(console.error);
