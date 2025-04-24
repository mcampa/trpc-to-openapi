import { z } from 'zod';
const mergeInputs = (inputParsers) => {
    return inputParsers.reduce((acc, inputParser) => {
        return acc.merge(inputParser);
    }, z.object({}));
};
// `inputParser` & `outputParser` are private so this is a hack to access it
export const getInputOutputParsers = (procedure) => {
    // @ts-expect-error The types seems to be incorrect
    const inputs = procedure._def.inputs;
    // @ts-expect-error The types seems to be incorrect
    const output = procedure._def.output;
    return {
        inputParser: inputs.length >= 2 ? mergeInputs(inputs) : inputs[0],
        outputParser: output,
    };
};
const getProcedureType = (procedure) => {
    if (!procedure._def.type) {
        throw new Error('Unknown procedure type');
    }
    return procedure._def.type;
};
export const forEachOpenApiProcedure = (procedureRecord, callback) => {
    for (const [path, procedure] of Object.entries(procedureRecord)) {
        // @ts-expect-error FIXME
        const meta = procedure._def.meta;
        const { openapi } = meta ?? {};
        if (openapi && openapi.enabled !== false) {
            const type = getProcedureType(procedure);
            callback({ path, type, procedure: procedure, openapi });
        }
    }
};
//# sourceMappingURL=procedure.js.map