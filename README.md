# SchemaPack

SchemaPack is a lightweight, high-performance, schema-driven, binary serialization library for TypeScript and JavaScript.


## Installation
```bash
npm install @megaofmegalodon/schemapack
```

## Getting Started
```javascript
import { SchemaPack } from "@megaofmegalodon/schemapack";

// 1. Register a schema layout
const opcode = SchemaPack.register({
    header: "u8",
    data1: { buffer: "u8", useTyped: true },
    data2: { buffer: "f32" },
    obj: { obj2: { a: "u8", b: "u32", c: "u16", d: { buffer: "u32" } } },
    footer: { authorId: "u32", date: "u32" }
});

// 2. Prepare payload matching the layout
const payload = {
    header: 0,
    data1: [120, 31, 42, 31, 41, 23],
    data2: [12.32, 3421.1, 432242.42, 34353.1, 4123129.1, 23.032199],
    obj: { obj2: { a: 1, b: 400000, c: 200, d: [144, 900000] } },
    footer: { authorId: 623441, date: 9231977 }
};

// 3. Encode to binary Uint8Array
const encoded = SchemaPack.encode(opcode, payload);

// 4. Decode back to JavaScript object
const decoded = SchemaPack.decode(encoded);
```

## Benchmarks
Performance comparison against JSON and standard serialization methods:

### Test One
Passing in this object as the payload for all libraries:
```javascript
const samplePayload = {
    header: 42,
    data1: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
    data2: [1.1, 2.2, 3.3, 4.4, 5.5],
    footer: 99
};
```

#### After 50,000 Iterations
| Library              | Payload Size | Encoding (ops/sec) | Decoding (ops/sec) |
| -------------------- | ------------ | ------------------ | ------------------ |
| SchemaPack           |   41 bytes   | 5,990,894 ops/s    | 2,949,584 ops/s    |
| MessagePack          |   86 bytes   | 1,359,638 ops/s    | 2,593,664 ops/s    |
| Native JSON Methods  |   96 bytes   | 3,084,555 ops/s    | 2,596,352 ops/s    |

#### After 1,000,000 Iterations
| Library              | Payload Size | Encoding (ops/sec) | Decoding (ops/sec) |
| -------------------- | ------------ | ------------------ | ------------------ |
| SchemaPack           |   41 bytes   | 4,985,560 ops/s    | 2,937,055 ops/s    |
| MessagePack          |   86 bytes   | 1,315,972 ops/s    | 2,555,684 ops/s    |
| Native JSON Methods  |   96 bytes   | 3,286,486 ops/s    | 2,564,398 ops/s    |

#### After 10,000,000 Iterations
| Library              | Payload Size | Encoding (ops/sec) | Decoding (ops/sec) |
| -------------------- | ------------ | ------------------ | ------------------ |
| SchemaPack           |   41 bytes   | 6,575,424 ops/s    | 3,044,456 ops/s    |
| MessagePack          |   86 bytes   | 1,327,414 ops/s    | 2,627,349 ops/s    |
| Native JSON Methods  |   96 bytes   | 3,324,393 ops/s    | 2,596,696 ops/s    |

### Test Two
Passing in this object as the payload for all libraries:
```javascript
const samplePayload = {
    header: 0,
    data1: [120, 31, 42, 31, 41, 23],
    data2: [12.320, 3421.1, 432242.42, 34353.1, 4123129.1, 23.032199],
    obj: { obj2: { a: 1, b: 400000, c: 200, d: [144, 900000] } },
    footer: { authorId: 623441, date: 9231977 }
};
```

#### After 50,000 Iterations
| Library              | Payload Size | Encoding (ops/sec) | Decoding (ops/sec) |
| -------------------- | ------------ | ------------------ | ------------------ |
| SchemaPack           |   59 bytes   | 2,854,058 ops/s    | 1,675,114 ops/s    |
| MessagePack          |  150 bytes   | 900,434 ops/s      | 1,378,111 ops/s    |
| Native JSON Methods  |  205 bytes   | 1,551,087 ops/s    | 1,267,206 ops/s    |

#### After 1,000,000 Iterations
| Library              | Payload Size | Encoding (ops/sec) | Decoding (ops/sec) |
| -------------------- | ------------ | ------------------ | ------------------ |
| SchemaPack           |   59 bytes   | 2,943,854 ops/s    | 1,679,496 ops/s    |
| MessagePack          |  150 bytes   | 796,269 ops/s      | 1,376,546 ops/s    |
| Native JSON Methods  |  205 bytes   | 1,641,224 ops/s    | 1,219,356 ops/s    |

#### After 10,000,000 Iterations
| Library              | Payload Size | Encoding (ops/sec) | Decoding (ops/sec) |
| -------------------- | ------------ | ------------------ | ------------------ |
| SchemaPack           |   59 bytes   | 2,921,812 ops/s    | 1,683,226 ops/s    |
| MessagePack          |  150 bytes   | 853,490 ops/s      | 1,363,437 ops/s    |
| Native JSON Methods  |  205 bytes   | 1,612,329 ops/s    | 1,257,947 ops/s    |

## API Reference
### Schema Registry
* ```SchemaPack.register(layout: PacketSchemaLayout, options?: RegistryOptions): number``` - Creates a packet schema internally and returns packet opcode.

### SchemaPack Configurations
* ```SchemaPack.resize(newSize: number): void``` - Resizes the internal scratch pad buffer.

### Encode & Decode
* ```SchemaPack.encode(opcode, data: any, makeCopy?: boolean): Uint8Array``` - Encodes JavaScript object into ultra-compressed binary layout. Returned Uint8Array is a lightweight view of the internal scratchpad buffer, unless ```makeCopy``` is set to ```true```, in which it returns a copied slice.
* ```SchemaPack.decode(data: Uint8Array): any``` - Decodes packed binary data and reconstructs compressed JavaScript object or array.
* ```SchemaPack.decodePooled(data: Uint8Array): any``` - Decodes packed binary data using reallocated objects from ringBuffer.

### Miscellaneous
* ```SchemaPack.instantiate(opcode: number): any``` - Instantiates a template JavaScript object or array initialized with zero-values according to opcode's schema layout.

### Schema Layout & Types

Schemas are defined using the ```PacketSchemaLayout``` type definition:
```typescript
export const TypeSize = {
    "bool": 1, "i8": 1, "u8": 1,
    "i16": 2, "u16": 2,
    "i32": 4, "u32": 4, "f32": 4,
    "f64": 8
} as const;

type PrimitiveType = keyof typeof TypeSize;

type BufferType = { 
    buffer: PrimitiveType, 
    useTyped?: boolean, 
    length?: number 
};

type ObjectType = { 
    [key: string]: PrimitiveType | BufferType | ObjectType | ObjectType[] | PrimitiveType[]; 
};

type PacketSchemaLayout = BufferType | PrimitiveType | ObjectType | PacketSchemaLayout[];
```

### Primitive Types
Primitive types specify raw data sizes in bytes:

| Type       | Description                              | Byte Size |
| --------   | ---------------------------------------- | ------    |
| ```bool``` | Boolean (true/false)                     | 1 byte    |
| ```i8```   | Signed 8-bit Integer                     | 1 byte    |
| ```u8```   | Unsigned 8-bit Integer                   | 1 byte    |
| ```i16```  | Signed 16-bit Integer                    | 2 bytes   |
| ```u16```  | Unsigned 16-bit Integer                  | 2 bytes   |
| ```i32```  | Signed 32-bit Integer                    | 4 bytes   |
| ```u32```  | Unsigned 32-bit Integer                  | 4 bytes   |
| ```f32```  | 32-bit Floating Point (Single precision) | 4 bytes   |
| ```f64```  | 64-bit Floating Point (Double precision) | 8 bytes   |

### Buffer Types (BufferType)
To serialize dynamic or fixed-length arrays/buffers, pass a BufferType configuration object:
```javascript
// Variable-length array of unsigned 8-bit integers
data1: { buffer: "u8" }

// Array decoded as a JS TypedArray (e.g. Uint8Array) for maximum performance
data2: { buffer: "u8", useTyped: true }

// Fixed-length array (omits the length prefix on the wire to save bytes)
data3: { buffer: "f32", length: 16 }
```

### Complex & Nested Structures
You can nest objects and arrays freely within a schema:

```javascript
const schema = SchemaPack.register({
    // Primitive fields
    id: "u32",
    active: "bool",

    // Primitive array containing one "u16" item
    scores: ["u16"],

    // Fixed-length array of "u16" values of length 50
    scoreHistory: { buffer: "u16", length: 50 },

    // Nested object
    position: { x: "f32", y: "f32" },

    // Array of containing one object
    inventory: [{ id: "u16", count: "u8" }]
});
```

> Note: All "arrays" are internally tuples, for dynamic array creation, use BufferType.

## License
This project is licensed under MIT.