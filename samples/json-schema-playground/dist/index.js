"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ajv_1 = __importDefault(require("ajv"));
const schema = {
    type: "object",
    properties: {
        name: { type: "string" },
        age: { type: "number" }
    },
    required: ["name", "age"],
    additionalProperties: false
};
// Validate data using Ajv
const validateData = (data) => {
    const ajv = new ajv_1.default();
    const validate = ajv.compile(schema);
    const isValid = validate(data);
    if (isValid) {
        console.log("Data is valid!");
    }
    else {
        console.error("Validation errors:", validate.errors);
    }
};
// Sample data
const data = { name: "Alice", age: 30 };
validateData(data);
