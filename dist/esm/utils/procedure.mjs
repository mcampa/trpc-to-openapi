import { z } from 'zod';
const mergeInputs = (inputParsers) => {
    return inputParsers.reduce((acc, inputParser) => {
        return acc.merge(inputParser);
    }, z.object({}));
};
// `inputParser` & `outputParser` are private so this is a hack to access it
export const getInputOutputParsers = (procedure) => {
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
        inputParser = z.object({});
    }
    return {
        inputParser,
        outputParser: output,
        hasInputsDefined: inputs.length > 0,
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
        const meta = procedure._def.meta;
        if (meta?.openapi && meta.openapi.enabled !== false) {
            const type = getProcedureType(procedure);
            callback({
                path,
                type,
                procedure: procedure,
                meta: {
                    openapi: meta.openapi,
                    ...meta,
                },
            });
        }
    }
};
//# sourceMappingURL=procedure.js.map