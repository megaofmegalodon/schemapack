import { ObjectRingBuffer } from "./ObjectRingBuffer.ts";

export const TypeSize = {
    "bool": 1, "i8": 1, "u8": 1,
    "i16": 2, "u16": 2,
    "i32": 4, "u32": 4, "f32": 4,
    "f64": 8
} as const;

type PrimitiveType = keyof typeof TypeSize;

type BufferType = { buffer: PrimitiveType, useTyped?: boolean, length?: number };
type ObjectType = { [key: string]: PrimitiveType | BufferType | ObjectType | ObjectType[] | PrimitiveType[]; };
type PacketSchemaLayout = BufferType | PrimitiveType | ObjectType | PacketSchemaLayout[];

type PrimitiveInstruction = {
    op: "PRIMITIVE";
    raw: boolean;
    type: PrimitiveType;
    key?: string;
};

type NewArrayInstruction = { op: "NEW_ARRAY", key?: string };
type ExitArrayInstruction = { op: "EXIT_ARRAY" };

type EnterObjectInstruction = { op: "ENTER_OBJECT", key?: string };
type ExistObjectInstruction = { op: "EXIT_OBJECT" };
type CreateBufferObjectInstruction = { op: "CREATE_BUFFER_OBJ", type: PrimitiveType, useTyped: boolean, key?: string, length?: number };

export type Instruction = EnterObjectInstruction | CreateBufferObjectInstruction | ExistObjectInstruction | NewArrayInstruction | ExitArrayInstruction | PrimitiveInstruction;

const TypedConstructors = {
    bool: Uint8Array, i8: Int8Array, u8: Uint8Array,
    i16: Int16Array, u16: Uint16Array,
    i32: Int32Array, u32: Uint32Array, f32: Float32Array,
    f64: Float64Array
};

type RegistryOptions = { pool?: number };

export class SchemaPack {
    private constructor() { }
    private static readonly BUFFER_LENGTH_TYPE: PrimitiveType = "i32";
    private static readonly BUFFER_LENGTH_SIZE = 4;

    private static opcodes = 0;
    private static opcodeToInstructions = new Map<number, Readonly<Instruction>[]>();
    private static opcodeToRingBuffer = new Map<number, ObjectRingBuffer>();

    private static scratchPadBuffer = new Uint8Array(10485760);
    private static scratchPadView = new DataView(this.scratchPadBuffer.buffer);

    private static isPrimitiveType(val: string) {
        return val === "bool" || val === "i8" || val === "u8" || val === "i16" || val === "u16" || val === "i32" || val === "u32" || val === "f32" || val === "f64";
    }

    private static getTypedConstructor(type: PrimitiveType) {
        return TypedConstructors[type];
    }

    /**
     * Resizes SchemaPack's shared internal scratchpad buffer.
     * 
     * Replaces the existing memory allocation with a newly allocated `Uint8Array` 
     * of the specified size and re-binds the internal `DataView`.
     * 
     * @param newSize - The new buffer capacity in bytes.
     * 
     * @warning Any un-sliced `.subarray()` references previously returned by `encode` 
     * will still point to the old buffer allocation, not this new buffer.
     */

    static resize(newSize: number) {
        this.scratchPadBuffer = new Uint8Array(newSize);
        this.scratchPadView = new DataView(this.scratchPadBuffer.buffer);
    }

    private static walkFields(
        fields: PacketSchemaLayout,
        instructions: Instruction[],
        isNested: boolean = false,
        key?: string,
        onlyStaticLayout?: boolean
    ) {
        if (typeof fields === "string") {
            if (!this.isPrimitiveType(fields))
                throw new Error(`SchemaPack: Invalid primitive type: ${fields}`);

            instructions.push({ op: "PRIMITIVE", raw: !isNested, type: fields, key });
            return;
        }

        if (Array.isArray(fields)) {
            if (isNested) {
                instructions.push({ op: "NEW_ARRAY", key });
            }

            for (let i = 0; i < fields.length; i++) {
                this.walkFields(fields[i], instructions, true, undefined, onlyStaticLayout);
            }

            if (isNested) {
                instructions.push({ op: "EXIT_ARRAY" });
            }
        }

        if (!Array.isArray(fields) && typeof fields === "object") {
            if (fields.buffer) {
                fields = fields as BufferType;
                const isBool = fields.buffer == "bool";

                if (isBool && fields.useTyped)
                    throw new Error(`SchemaPack: Cannot use TypedArray for buffer typeof bool.`);

                if (onlyStaticLayout && fields.length === undefined)
                    throw new Error(`SchemaPack: Cannot register pooled schema using dynamic BufferType.`);

                instructions.push({
                    op: "CREATE_BUFFER_OBJ",
                    type: fields.buffer,
                    useTyped: !!fields.useTyped,
                    length: fields.length,
                    key
                });
            } else {
                fields = fields as ObjectType;
                instructions.push({ op: "ENTER_OBJECT", key });

                const attributes: string[] = [];
                for (const key in fields) attributes.push(key);
                attributes.sort();

                for (let i = 0; i < attributes.length; i++) {
                    const key = attributes[i];
                    this.walkFields(fields[key], instructions, true, key, onlyStaticLayout);
                }

                instructions.push({ op: "EXIT_OBJECT" });
            }
        }
    }

    private static getVal(type: PrimitiveType, offset: number) {
        switch (type) {
            case "bool": return this.scratchPadView.getUint8(offset);
            case "i8": return this.scratchPadView.getInt8(offset);
            case "u8": return this.scratchPadView.getUint8(offset);
            case "i16": return this.scratchPadView.getInt16(offset, true);
            case "u16": return this.scratchPadView.getUint16(offset, true);
            case "i32": return this.scratchPadView.getInt32(offset, true);
            case "u32": return this.scratchPadView.getUint32(offset, true);
            case "f32": return this.scratchPadView.getFloat32(offset, true);
            case "f64": return this.scratchPadView.getFloat64(offset, true);
        }
    }

    private static setVal(type: PrimitiveType, offset: number, val: number) {
        switch (type) {
            case "bool": return this.scratchPadView.setUint8(offset, val);
            case "i8": return this.scratchPadView.setInt8(offset, val);
            case "u8": return this.scratchPadView.setUint8(offset, val);
            case "i16": return this.scratchPadView.setInt16(offset, val, true);
            case "u16": return this.scratchPadView.setUint16(offset, val, true);
            case "i32": return this.scratchPadView.setInt32(offset, val, true);
            case "u32": return this.scratchPadView.setUint32(offset, val, true);
            case "f32": return this.scratchPadView.setFloat32(offset, val, true);
            case "f64": return this.scratchPadView.setFloat64(offset, val, true);
        }
    }

    /**
     * Instantiates a template JavaScript object or array initialized with clean default
     * zero-values according to the registered opcode's schema layout.
     *
     * Default value assignments:
     * - `PRIMITIVE` (numbers/bytes): `0`
     * - `PRIMITIVE` (booleans): `false`
     * - `CREATE_BUFFER_OBJ` (TypedArrays): Pre-sized zero-filled array
     *
     * @param opcode - The unique schema opcode ID returned by {@link SchemaPack.register}.
     * @returns A freshly constructed object structure with default field initializations matching the schema.
     * @throws {Error} If the provided opcode is unregistered or unknown to SchemaPack.
     */

    static instantiate(opcode: number): any {
        const instructions = this.opcodeToInstructions.get(opcode);

        if (!instructions)
            throw new Error(`SchemaPack: Invalid opcode, cannot instantiate unknown opcode of '$${opcode}'.`);

        const firstInstruction = instructions[0];
        if (firstInstruction.op === "PRIMITIVE" && firstInstruction.raw) {
            const isBool = firstInstruction.type === "bool";
            return isBool ? false : 0;
        }

        const result: any = firstInstruction.op === "ENTER_OBJECT" ? {} : [];
        const itemStack: (any[] | any)[] = [result];
        const indexStack: number[] = [0];

        for (let i = 0; i < instructions.length; i++) {
            const inst = instructions[i];
            const currentDepth = itemStack.length - 1;

            if (inst.op === "PRIMITIVE") {
                const targetItem = itemStack[currentDepth];
                const isBool = inst.type === "bool";

                if (!Array.isArray(targetItem) && inst.key) {
                    targetItem[inst.key] = isBool ? false : 0;
                } else {
                    const currentIndex = indexStack[currentDepth];
                    targetItem[currentIndex] = isBool ? false : 0;
                    indexStack[currentDepth]++;
                }
            } else if (inst.op === "ENTER_OBJECT") {
                if (i === 0) continue;

                const parentItem = itemStack[currentDepth];
                const obj = {};

                if (Array.isArray(parentItem)) {
                    const parentIndex = indexStack[currentDepth];
                    parentItem[parentIndex] = obj;
                    indexStack[currentDepth]++;
                } else if (inst.key) {
                    parentItem[inst.key] = obj;
                }

                itemStack.push(obj);
                indexStack.push(0);
            } else if (inst.op === "EXIT_OBJECT" || inst.op === "EXIT_ARRAY") {
                if (i === instructions.length - 1) continue;
                itemStack.pop();
                indexStack.pop();
            } else if (inst.op === "NEW_ARRAY") {
                const parentItem = itemStack[currentDepth];
                const newChild: any[] = [];

                if (Array.isArray(parentItem)) {
                    const parentIndex = indexStack[currentDepth];
                    parentItem[parentIndex] = newChild;
                    indexStack[currentDepth]++;
                } else if (inst.key) {
                    parentItem[inst.key] = newChild;
                }

                itemStack.push(newChild);
                indexStack.push(0);
            } else if (inst.op === "CREATE_BUFFER_OBJ") {
                const targetItem = itemStack[currentDepth];
                const length = inst.length ?? 0;
                const isBool = inst.type === "bool";

                const TypedConstructor = this.getTypedConstructor(inst.type);
                const target: any | any[] = inst.useTyped ? new TypedConstructor(length).fill(0) : new Array(length).fill(isBool ? false : 0);

                if (!Array.isArray(targetItem) && inst.key) {
                    targetItem[inst.key] = target;
                } else {
                    const currentIndex = indexStack[currentDepth];
                    targetItem[currentIndex] = target;
                    indexStack[currentDepth]++;
                }
            }
        }

        return result;
    }

    /**
     * Encodes a JavaScript payload into a packed binary buffer using the pre-compiled
     * instructions associated with the given opcode.
     * 
     * The encoded packet prepends the 1-byte opcode identifier at index `0`, followed
     * by packed primitives, objects, or arrays according to the registered schema layout.
     * 
     * @param opcode - The unique schema opcode ID returned by {@link SchemaPack.register}.
     * @param data - The raw primitive value, object, or array matching the registered schema structure.
     * @param makeCopy
     * * If `true`, copies the encoded bytes into a new buffer instance via `.slice()`. 
     * * If `false`, returns a fast, zero-copy `.subarray()` view of the internal scratchpad buffer.
     * * Default is `false`.
     * @returns A `Uint8Array` containing the binary encoded payload.
     * 
     * @throws {Error} If `opcode` has not been registered.
     * @throws {Error} If `data` type does not match the expected primitive or buffer structure.
     * 
     * @warning **Ephemeral Views:** When `makeCopy` is `false`, the returned array points directly to 
     * the internal `scratchPadBuffer`. Subsequent calls to `encode` or `decode` will overwrite these bytes. 
     * Set `makeCopy` to `true` or manually invoke `.slice()` if storing the output across async frames.
     */

    static encode(opcode: number, data: any, makeCopy: boolean = false) {
        const instructions = this.opcodeToInstructions.get(opcode);
        if (!instructions)
            throw new Error(`SchemaPack: Cannot encode unknown opcode '${opcode}'`);

        this.scratchPadBuffer[0] = opcode;
        const firstInstruction = instructions[0];

        if (firstInstruction.op === "PRIMITIVE" && firstInstruction.raw) {
            if (typeof data !== "number")
                throw new Error(`SchemaPack: Expected raw primitive number.`);

            const isBool = firstInstruction.type === "bool";
            this.setVal(firstInstruction.type, 1, isBool ? data ? 1 : 0 : data);
            return this.scratchPadBuffer.subarray(0, 1 + TypeSize[firstInstruction.type]);
        }

        let totalLength = 1;
        let offsetPadding = 0;
        const itemStack: any[] = [data];
        const indexStack: number[] = [0];

        for (let i = 0; i < instructions.length; i++) {
            const inst = instructions[i];
            const currentDepth = itemStack.length - 1;

            if (inst.op === "PRIMITIVE") {
                const currentItem = itemStack[currentDepth];
                const isBool = inst.type === "bool";
                let val: number;

                if (Array.isArray(currentItem)) {
                    const currentIndex = indexStack[currentDepth];
                    val = currentItem[currentIndex];
                    indexStack[currentDepth]++;
                } else if (inst.key) {
                    val = currentItem[inst.key];
                } else {
                    val = currentItem;
                }

                this.setVal(inst.type, totalLength, isBool ? val ? 1 : 0 : val);
                totalLength += TypeSize[inst.type];
            } else if (inst.op === "ENTER_OBJECT") {
                if (i === 0) continue;

                const parentItem = itemStack[currentDepth];
                let nextObj: any;

                if (Array.isArray(parentItem)) {
                    const parentIndex = indexStack[currentDepth];
                    nextObj = parentItem[parentIndex];
                    indexStack[currentDepth]++;
                } else if (inst.key) {
                    nextObj = parentItem[inst.key];
                }

                itemStack.push(nextObj);
                indexStack.push(0);
            } else if (inst.op === "EXIT_OBJECT" || inst.op === "EXIT_ARRAY") {
                if (i === instructions.length - 1) continue;
                itemStack.pop();
                indexStack.pop();
            } else if (inst.op === "NEW_ARRAY") {
                const parentItem = itemStack[currentDepth];
                let nextArr: any[];

                if (Array.isArray(parentItem)) {
                    const parentIndex = indexStack[currentDepth];
                    nextArr = parentItem[parentIndex];
                    indexStack[currentDepth]++;
                } else if (inst.key) {
                    nextArr = parentItem[inst.key];
                } else {
                    nextArr = parentItem;
                }

                itemStack.push(nextArr);
                indexStack.push(0);
            } else if (inst.op === "CREATE_BUFFER_OBJ") {
                const currentItem = itemStack[currentDepth];
                const size = TypeSize[inst.type];
                const isBool = inst.type === "bool";
                let arr: number[];

                if (Array.isArray(currentItem)) {
                    const currentIndex = indexStack[currentDepth];
                    arr = currentItem[currentIndex];
                    indexStack[currentDepth]++;
                } else if (inst.key) {
                    arr = currentItem[inst.key];
                } else {
                    arr = currentItem;
                }

                if (!Array.isArray(arr) && !ArrayBuffer.isView(arr))
                    throw new Error(`SchemaPack: Expected Array or TypedArray for buffer field`);

                if (inst.length === undefined) {
                    this.setVal(this.BUFFER_LENGTH_TYPE, totalLength, arr.length);
                    offsetPadding += this.BUFFER_LENGTH_SIZE;
                    totalLength += this.BUFFER_LENGTH_SIZE;
                }

                if (ArrayBuffer.isView(arr)) {
                    const sourceBytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
                    this.scratchPadBuffer.set(sourceBytes, totalLength);
                    offsetPadding += sourceBytes.byteLength;
                    totalLength += sourceBytes.byteLength;
                } else {
                    for (let j = 0; j < arr.length; j++) {
                        const val = arr[j];
                        this.setVal(inst.type, totalLength, isBool ? val ? 1 : 0 : val);
                        offsetPadding += size;
                        totalLength += size;
                    }
                }
            }
        }

        return makeCopy ? this.scratchPadBuffer.slice(0, totalLength) : this.scratchPadBuffer.subarray(0, totalLength);
    }

    /**
     * Decodes a packed binary buffer back into its original JavaScript representation.
     * 
     * Reads the 1-byte opcode identifier at byte offset `0` to look up the matching schema 
     * instructions, copies the input payload into the shared scratchpad workspace, and 
     * unpacks primitives, nested objects, arrays, and typed buffers accordingly.
     * 
     * @param data - The packed binary byte array to decode. Byte 0 must contain a registered schema opcode.
     * @returns The decoded JavaScript data—which can be a primitive number, boolean, array, or structured object matching the schema.
     * 
     * @throws {Error} If `data` is empty, missing, or falsy.
     * @throws {Error} If the opcode at byte `0` has not been registered via {@link SchemaPack.register}.
     * @throws {Error} If buffer lengths encoded within the packet exceed the total payload byte length.
     */

    static decode(data: Uint8Array): any {
        if (data.length === 0 || !data)
            throw new Error(`SchemaPack: Cannot decode data of length 0 or undefined.`);

        const opcode = data[0];
        const instructions = this.opcodeToInstructions.get(opcode);

        if (!instructions)
            throw new Error(`SchemaPack: Invalid opcode, cannot decode unknown opcode of '$${opcode}'.`);

        const firstInstruction = instructions[0];
        this.scratchPadBuffer.set(data, 0);

        if (firstInstruction.op === "PRIMITIVE" && firstInstruction.raw) {
            const val = this.getVal(firstInstruction.type, 1);
            const isBool = firstInstruction.type === "bool";
            return isBool ? val ? true : false : val;
        }

        const result: any = firstInstruction.op === "ENTER_OBJECT" ? {} : [];
        const itemStack: (any[] | any)[] = [result];
        const indexStack: number[] = [0];

        let offsetPadding = 0;
        let currentLength = 1;

        for (let i = 0; i < instructions.length; i++) {
            const inst = instructions[i];
            const currentDepth = itemStack.length - 1;

            if (inst.op === "PRIMITIVE") {
                const targetItem = itemStack[currentDepth];
                const isBool = inst.type === "bool";
                const val = this.getVal(inst.type, currentLength);

                if (!Array.isArray(targetItem) && inst.key) {
                    targetItem[inst.key] = isBool ? val ? true : false : val;
                } else {
                    const currentIndex = indexStack[currentDepth];
                    targetItem[currentIndex] = isBool ? val ? true : false : val;
                    indexStack[currentDepth]++;
                }

                currentLength += TypeSize[inst.type];
            } else if (inst.op === "ENTER_OBJECT") {
                if (i === 0) continue;

                const parentItem = itemStack[currentDepth];
                const obj = {};

                if (Array.isArray(parentItem)) {
                    const parentIndex = indexStack[currentDepth];
                    parentItem[parentIndex] = obj;
                    indexStack[currentDepth]++;
                } else if (inst.key) {
                    parentItem[inst.key] = obj;
                }

                itemStack.push(obj);
                indexStack.push(0);
            } else if (inst.op === "EXIT_OBJECT" || inst.op === "EXIT_ARRAY") {
                if (i === instructions.length - 1) continue;
                itemStack.pop();
                indexStack.pop();
            } else if (inst.op === "NEW_ARRAY") {
                const parentItem = itemStack[currentDepth];
                const newChild: any[] = [];

                if (Array.isArray(parentItem)) {
                    const parentIndex = indexStack[currentDepth];
                    parentItem[parentIndex] = newChild;
                    indexStack[currentDepth]++;
                } else if (inst.key) {
                    parentItem[inst.key] = newChild;
                }

                itemStack.push(newChild);
                indexStack.push(0);
            } else if (inst.op === "CREATE_BUFFER_OBJ") {
                const targetItem = itemStack[currentDepth];
                const length = inst.length ?? this.getVal(this.BUFFER_LENGTH_TYPE, currentLength);
                const isBool = inst.type === "bool";

                if (inst.length === undefined) {
                    offsetPadding += this.BUFFER_LENGTH_SIZE;
                    currentLength += this.BUFFER_LENGTH_SIZE;
                }

                const size = TypeSize[inst.type];
                const remainingBytes = data.length - currentLength;

                if (length * size > remainingBytes)
                    throw new Error(`SchemaPack: Malformed buffer length ${length} exceeds incoming packet payload (${data.length} bytes).`);

                const TypedConstructor = this.getTypedConstructor(inst.type);
                const target: any | any[] = inst.useTyped ? new TypedConstructor(length) : [];

                if (!Array.isArray(targetItem) && inst.key) {
                    targetItem[inst.key] = target;
                } else {
                    const currentIndex = indexStack[currentDepth];
                    targetItem[currentIndex] = target;
                    indexStack[currentDepth]++;
                }

                if (ArrayBuffer.isView(target)) {
                    const byteLength = length * size;
                    const sourceSlice = this.scratchPadBuffer.subarray(currentLength, currentLength + byteLength);
                    new Uint8Array(target.buffer, target.byteOffset, target.byteLength).set(sourceSlice);

                    offsetPadding += byteLength;
                    currentLength += byteLength;
                } else {
                    for (let i = 0; i < length; i++) {
                        const val = this.getVal(inst.type, currentLength);
                        target[i] = isBool ? val ? true : false : val;
                        offsetPadding += size;
                        currentLength += size;
                    }
                }
            }
        }

        return result;
    }

    private static pooledItemStack: (any[] | any)[] = [];
    private static pooledIndexStack: number[] = [];

    /**
     * Decodes a packed binary buffer back into its original JavaScript representation
     * without intensive object and array allocation using pre-allocated ring buffers.
     * 
     * Read {@link SchemaPack.decode} for information on how the decoding process is executed.
     * 
     * @param data - The packed binary byte array to decode. Byte 0 must contain a registered schema opcode.
     * @returns The decoded JavaScript data—which can be a array or structured object matching the schema.
     * 
     * @warning Returned object must be used in a short-term matter.
     * Objects should not exit out of the caller as they have the potential to be overwritten in subsequent calls.
     * 
     * @throws {Error} If `data` is empty, missing, or falsy.
     * @throws {Error} If the opcode at byte `0` has not been registered via {@link SchemaPack.register}.
     * @throws {Error} If buffer lengths encoded within the packet exceed the total payload byte length.
     * @throws {Error} If the opcode is not registered to use ring buffer.
     * @throws {Error} If method is used to decode single raw primitive value.
     */

    static decodePooled(data: Uint8Array): Readonly<any> {
        if (data.length === 0 || !data)
            throw new Error(`SchemaPack: Cannot decode data of length 0 or undefined.`);

        const opcode = data[0];
        const instructions = this.opcodeToInstructions.get(opcode);
        const outputBuf = this.opcodeToRingBuffer.get(opcode);

        if (!instructions)
            throw new Error(`SchemaPack: Invalid opcode, cannot decode unknown opcode of '$${opcode}'.`);

        if (!outputBuf)
            throw new Error(`SchemaPack: Cannot find ringBuffer for opcode '${opcode}'. If this is unexpected, ensure that opcode registry has optional pool value defined.`);

        const firstInstruction = instructions[0];
        this.scratchPadBuffer.set(data, 0);

        if (firstInstruction.op === "PRIMITIVE" && firstInstruction.raw)
            throw new Error(`SchemaPack: Decoding opcode of '${opcode}' does not require explicit call to decodePooled(), use decode() instead.`);

        const result: any = outputBuf.get();
        const itemStack = this.pooledItemStack;
        const indexStack = this.pooledIndexStack;

        itemStack.length = 1;
        indexStack.length = 1;

        itemStack[0] = result;
        indexStack[0] = 0;

        let offsetPadding = 0;
        let currentLength = 1;

        for (let i = 0; i < instructions.length; i++) {
            const inst = instructions[i];
            const currentDepth = itemStack.length - 1;

            if (inst.op === "PRIMITIVE") {
                const targetItem = itemStack[currentDepth];
                const isBool = inst.type === "bool";
                const val = this.getVal(inst.type, currentLength);

                if (!Array.isArray(targetItem) && inst.key) {
                    targetItem[inst.key] = isBool ? val ? true : false : val;
                } else {
                    const currentIndex = indexStack[currentDepth];
                    targetItem[currentIndex] = isBool ? val ? true : false : val;
                    indexStack[currentDepth]++;
                }

                currentLength += TypeSize[inst.type];
            } else if (inst.op === "ENTER_OBJECT") {
                if (i === 0) continue;
                const parentItem = itemStack[currentDepth];

                if (Array.isArray(parentItem)) {
                    const parentIndex = indexStack[currentDepth];
                    itemStack.push(parentItem[parentIndex]);
                    indexStack[currentDepth]++;
                } else if (inst.key) {
                    itemStack.push(parentItem[inst.key]);
                }

                indexStack.push(0);
            } else if (inst.op === "EXIT_OBJECT" || inst.op === "EXIT_ARRAY") {
                if (i === instructions.length - 1) continue;
                itemStack.pop();
                indexStack.pop();
            } else if (inst.op === "NEW_ARRAY") {
                const parentItem = itemStack[currentDepth];

                if (Array.isArray(parentItem)) {
                    const parentIndex = indexStack[currentDepth];
                    itemStack.push(parentItem[parentIndex]);
                    indexStack[currentDepth]++;
                } else if (inst.key) {
                    itemStack.push(parentItem[inst.key]);
                }

                indexStack.push(0);
            } else if (inst.op === "CREATE_BUFFER_OBJ") {
                const targetItem = itemStack[currentDepth];
                const length = inst.length;
                const isBool = inst.type === "bool";

                if (length === undefined)
                    throw new Error(`SchemaPack: decodePool() cannot decode schema with dynamic BufferType. If this is unexpected, add length attribute to the schema registration`);

                const size = TypeSize[inst.type];
                const remainingBytes = data.length - currentLength;

                if (length * size > remainingBytes)
                    throw new Error(`SchemaPack: Malformed buffer length ${length} exceeds incoming packet payload (${data.length} bytes).`);

                let target: any | any[];

                if (!Array.isArray(targetItem) && inst.key) {
                    target = targetItem[inst.key];
                } else {
                    const currentIndex = indexStack[currentDepth];
                    target = targetItem[currentIndex];
                    indexStack[currentDepth]++;
                }

                if (ArrayBuffer.isView(target)) {
                    const byteLength = length * size;
                    const sourceSlice = this.scratchPadBuffer.subarray(currentLength, currentLength + byteLength);
                    new Uint8Array(target.buffer, target.byteOffset, target.byteLength).set(sourceSlice);

                    offsetPadding += byteLength;
                    currentLength += byteLength;
                } else {
                    for (let i = 0; i < length; i++) {
                        const val = this.getVal(inst.type, currentLength);
                        target[i] = isBool ? val ? true : false : val;
                        offsetPadding += size;
                        currentLength += size;
                    }
                }
            }
        }

        return result;
    }

    /**
     * Registers a packet schema structure and compiles it into a set of fast byte-packing instructions.
     * 
     * Auto-increments and assigns a unique 1-byte opcode integer identifier (`0` to `255`) to the registered
     * layout. The generated instruction set is cached internally to enable zero-parse overhead during 
     * subsequent `encode` and `decode` operations.
     * 
     * @param layout - The schema definition describing the payload fields, primitive types, nested objects, or typed buffer arrays.
     * @returns The newly allocated opcode integer identifier associated with this schema layout.
     * 
     * @throws {Error} If the max limit of 256 unique opcodes has been exceeded.
     * @throws {Error} If `layout` contains unsupported type names or malformed structure definitions.
     * 
     * @example
     * ```typescript
     * const playerStateOpcode = SchemaPack.register({
     *   id: "u16",
     *   position: { x: "f32", y: "f32" },
     *   health: "u8"
     * });
     * ```
     */

    static register(layout: PacketSchemaLayout, options: RegistryOptions = {}): number {
        const instructions: Instruction[] = [];
        const opcode = this.opcodes++;

        if (opcode > 255)
            throw new Error(`SchemaPack: Max number of unique single byte opcodes have been reached.`);

        this.walkFields(layout, instructions, false, undefined, !!options.pool);
        this.opcodeToInstructions.set(opcode, instructions);

        if (options.pool && options.pool > 0)
            this.opcodeToRingBuffer.set(opcode, new ObjectRingBuffer(opcode, options.pool));

        return opcode;
    }
}

export const encode = SchemaPack.encode;
export const decode = SchemaPack.decode;
export const register = SchemaPack.register;

export const decodePooled = SchemaPack.decodePooled;
export const instantiate = SchemaPack.instantiate;