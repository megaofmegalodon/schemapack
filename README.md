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
| Library              | Payload Size | Encoding (ops/sec) | Decoding (ops/sec) | Pooled Decoding (ops/sec) |
| -------------------- | ------------ | ------------------ | ------------------ | ------------------------- |
| SchemaPack           |   33 bytes   | 5,799,511 ops/s    | 4,824,974 ops/s    | 4,273,992 ops/s           |
| MessagePack          |   86 bytes   | 1,350,982 ops/s    | 2,539,898 ops/s    | N/A                       |
| Native JSON Methods  |   96 bytes   | 3,188,682 ops/s    | 2,613,633 ops/s    | N/A                       |

#### After 1,000,000 Iterations
| Library              | Payload Size | Encoding (ops/sec) | Decoding (ops/sec) | Pooled Decoding (ops/sec) |
| -------------------- | ------------ | ------------------ | ------------------ | ------------------------- |
| SchemaPack           |   33 bytes   | 6,436,263 ops/s    | 4,989,230 ops/s    | 4,582,111 ops/s           |
| MessagePack          |   86 bytes   | 1,297,098 ops/s    | 2,580,810 ops/s    | N/A                       |
| Native JSON Methods  |   96 bytes   | 3,272,478 ops/s    | 2,300,813 ops/s    | N/A                       |

#### After 10,000,000 Iterations
| Library              | Payload Size | Encoding (ops/sec) | Decoding (ops/sec) | Pooled Decoding (ops/sec) |
| -------------------- | ------------ | ------------------ | ------------------ | ------------------------- |
| SchemaPack           |   33 bytes   | 6,598,867 ops/s    | 4,943,375 ops/s    | 4,848,845 ops/s           |
| MessagePack          |   86 bytes   | 1,320,426 ops/s    | 2,622,500 ops/s    | N/A                       |
| Native JSON Methods  |   96 bytes   | 3,200,103 ops/s    | 2,544,954 ops/s    | N/A                       |

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
| Library              | Payload Size | Encoding (ops/sec) | Decoding (ops/sec) | Pooled Decoding (ops/sec) |
| -------------------- | ------------ | ------------------ | ------------------ | ------------------------- |
| SchemaPack           |   40 bytes   | 3,733,224 ops/s    | 3,064,430 ops/s    | 3,185,635 ops/s           |
| MessagePack          |  150 bytes   |   758,329 ops/s    | 1,209,927 ops/s    | N/A                       |
| Native JSON Methods  |  205 bytes   | 1,575,301 ops/s    | 1,264,901 ops/s    | N/A                       |

#### After 1,000,000 Iterations
| Library              | Payload Size | Encoding (ops/sec) | Decoding (ops/sec) | Pooled Decoding (ops/sec) |
| -------------------- | ------------ | ------------------ | ------------------ | ------------------------- |
| SchemaPack           |   40 bytes   | 4,727,527 ops/s    | 3,416,007 ops/s    | 4,026,528 ops/s           |
| MessagePack          |  150 bytes   |   837,954 ops/s    | 1,359,004 ops/s    | N/A                       |
| Native JSON Methods  |  205 bytes   | 1,642,498 ops/s    | 1,259,750 ops/s    | N/A                       |

#### After 10,000,000 Iterations
| Library              | Payload Size | Encoding (ops/sec) | Decoding (ops/sec) | Pooled Decoding (ops/sec) |
| -------------------- | ------------ | ------------------ | ------------------ | ------------------------- |
| SchemaPack           |   40 bytes   | 4,941,428 ops/s    | 3,772,014 ops/s    | 3,996,334 ops/s           |
| MessagePack          |  150 bytes   |   862,576 ops/s    | 1,309,794 ops/s    | N/A                       |
| Native JSON Methods  |  205 bytes   | 1,585,177 ops/s    | 1,252,157 ops/s    | N/A                       |

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