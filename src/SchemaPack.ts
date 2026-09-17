export const TypeSize = {
    "i8": 1, "u8": 1,
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
    offset: number;
    key?: string;
};

type NewArrayInstruction = { op: "NEW_ARRAY", key?: string };
type ExitArrayInstruction = { op: "EXIT_ARRAY" };

type EnterObjectInstruction = { op: "ENTER_OBJECT", key?: string };
type ExistObjectInstruction = { op: "EXIT_OBJECT" };
type CreateBufferObjectInstruction = { op: "CREATE_BUFFER_OBJ", type: PrimitiveType, useTyped: boolean, key?: string, length?: number };

type Instruction = EnterObjectInstruction | CreateBufferObjectInstruction | ExistObjectInstruction | NewArrayInstruction | ExitArrayInstruction | PrimitiveInstruction;

const TypedConstructors = {
    i8: Int8Array, u8: Uint8Array,
    i16: Int16Array, u16: Uint16Array,
    i32: Int32Array, u32: Uint32Array, f32: Float32Array,
    f64: Float64Array
};

export class SchemaPack {
    private constructor() { }
    private static readonly BUFFER_LENGTH_TYPE: PrimitiveType = "i32";
    private static readonly BUFFER_LENGTH_SIZE = 4;

    private static opcodes = 0;
    private static opcodeToInstructions = new Map<number, Readonly<Instruction>[]>();

    private static scratchPadBuffer = new Uint8Array(10485760);
    private static scratchPadView = new DataView(this.scratchPadBuffer.buffer);

    private static isPrimitiveType(val: string) {
        return val === "i8" || val === "u8" || val === "i16" || val === "u16" || val === "i32" || val === "u32" || val === "f32" || val === "f64";
    }

    private static getTypedConstructor(type: PrimitiveType) {
        return TypedConstructors[type];
    }

    /**
     * 
     * @param newSize 
     */

    static resize(newSize: number) {
        this.scratchPadBuffer = new Uint8Array(newSize);
        this.scratchPadView = new DataView(this.scratchPadBuffer.buffer);
    }

    private static walkFields(
        fields: PacketSchemaLayout,
        instructions: Instruction[],
        offset: number,
        isNested: boolean = false,
        key?: string
    ) {
        if (typeof fields === "string") {
            if (!this.isPrimitiveType(fields))
                throw new Error(`SchemaPack: Invalid primitive type: ${fields}`);

            instructions.push({ op: "PRIMITIVE", raw: !isNested, type: fields, offset, key });
            return offset + TypeSize[fields];
        }

        if (Array.isArray(fields)) {
            if (isNested) {
                instructions.push({ op: "NEW_ARRAY", key });
            }

            for (let i = 0; i < fields.length; i++) {
                offset = this.walkFields(fields[i], instructions, offset, true);
            }

            if (isNested) {
                instructions.push({ op: "EXIT_ARRAY" });
            }
        }

        if (!Array.isArray(fields) && typeof fields === "object") {
            if (fields["buffer"]) {
                fields = fields as BufferType;

                instructions.push({
                    op: "CREATE_BUFFER_OBJ",
                    type: fields["buffer"],
                    useTyped: !!fields["useTyped"],
                    length: fields["length"],
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
                    offset = this.walkFields(fields[key], instructions, offset, true, key);
                }

                instructions.push({ op: "EXIT_OBJECT" });
            }
        }

        return offset;
    }

    private static getVal(type: PrimitiveType, offset: number) {
        switch (type) {
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
     * 
     * @param opcode 
     * @param data 
     * @returns 
     */

    static encode(opcode: number, data: any) {
        const instructions = this.opcodeToInstructions.get(opcode);
        if (!instructions)
            throw new Error(`SchemaPack: Cannot encode unknown opcode '${opcode}'`);

        this.scratchPadBuffer[0] = opcode;
        const firstInstruction = instructions[0];

        if (firstInstruction.op === "PRIMITIVE" && firstInstruction.raw) {
            if (typeof data !== "number")
                throw new Error(`SchemaPack: Expected raw primitive number.`);

            this.setVal(firstInstruction.type, 1, data);
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

                this.setVal(inst.type, inst.offset + offsetPadding, val);
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
                        this.setVal(inst.type, totalLength, arr[j]);
                        offsetPadding += size;
                        totalLength += size;
                    }
                }
            }
        }

        return this.scratchPadBuffer.subarray(0, totalLength);
    }

    /**
     * 
     * @param data 
     * @returns 
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
            return this.getVal(firstInstruction.type, 1);
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

                if (!Array.isArray(targetItem) && inst.key) {
                    targetItem[inst.key] = this.getVal(inst.type, inst.offset + offsetPadding);
                } else {
                    const currentIndex = indexStack[currentDepth];
                    targetItem[currentIndex] = this.getVal(inst.type, inst.offset + offsetPadding);
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

                if (inst.length === undefined) {
                    offsetPadding += this.BUFFER_LENGTH_SIZE;
                    currentLength += this.BUFFER_LENGTH_SIZE;
                }

                const size = TypeSize[inst.type];
                const remainingBytes = data.length - currentLength;

                if (length * size > remainingBytes)
                    throw new Error(`SchemaPack: Malformed buffer length ${length} exceeds incoming packet payload (${data.length} bytes).`);

                const TypedConstructor = this.getTypedConstructor(inst.type);
                let target: any | any[] = inst.useTyped ? new TypedConstructor(length) : [];

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
                        target[i] = this.getVal(inst.type, currentLength);
                        offsetPadding += size;
                        currentLength += size;
                    }
                }
            }
        }

        return result;
    }

    /**
     * 
     * @param layout 
     * @returns 
     */

    static register(layout: PacketSchemaLayout): number {
        const instructions: Instruction[] = [];
        const opcode = this.opcodes++;
        const INITIAL_OFFSET = 1;

        this.walkFields(layout, instructions, INITIAL_OFFSET);
        this.opcodeToInstructions.set(opcode, instructions);
        return opcode;
    }
}

export const encode = SchemaPack.encode;
export const decode = SchemaPack.decode;
export const register = SchemaPack.register;