"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.forEachOpenApiProcedure = exports.getInputOutputParsers = void 0;
const zod_1 = require("zod");
const mergeInputs = (inputParsers) => {
    return inputParsers.reduce((acc, inputParser) => {
        return acc.merge(inputParser);
    }, zod_1.z.object({}));
};
// `inputParser` & `outputParser` are private so this is a hack to access it
const getInputOutputParsers = (procedure) => {
    const inputs = procedure._def.inputs;
    // @ts-expect-error The types seems to be incorrect
    const output = procedure._def.output;
    let inputParser;
    if (inputs.length >= 2) {
        inputParser = mergeInputs(inputs);
    }
    else if (inputs.length === 1) {
        inputParser = inputs[0];
    }
    else {
        inputParser = zod_1.z.object({});
    }
    return {
        inputParser,
        outputParser: output,
        hasInputsDefined: inputs.length > 0,
    };
};
exports.getInputOutputParsers = getInputOutputParsers;
const getProcedureType = (procedure) => {
    if (!procedure._def.type) {
        throw new Error('Unknown procedure type');
    }
    return procedure._def.type;
};
const forEachOpenApiProcedure = (procedureRecord, callback) => {
    for (const [path, procedure] of Object.entries(procedureRecord)) {
        const meta = procedure._def.meta;
        if ((meta === null || meta === void 0 ? void 0 : meta.openapi) && meta.openapi.enabled !== false) {
            const type = getProcedureType(procedure);
            callback({
                path,
                type,
                procedure: procedure,
                meta: Object.assign({ openapi: meta.openapi }, meta),
            });
        }
    }
};
exports.forEachOpenApiProcedure = forEachOpenApiProcedure;
//# sourceMappingURL=procedure.js.map