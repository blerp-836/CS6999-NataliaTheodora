from jsf import JSF
import json
import sys

file = sys.argv[1]
print(file)

faker = JSF(
    {
        "type": "object",
        "properties": {
            "name": {"type": "string", "$provider": "faker.name"},
            "email": {"type": "string", "$provider": "faker.email"},
        },
        "required": ["name", "email"],
    }
)

#faker = JSF.from_json("test.json")
faker = JSF.from_json(file)
fake_json = faker.generate()
print(json.dumps(fake_json, indent=4))
