import { Options, ParserField } from '../../Models';
import { Helpers, TypeDefinition, TypeSystemDefinition } from '../../Models/Spec';

export const VALUETYPES = 'ValueTypes';

const resolveValueType = (t: string) => `${VALUETYPES}["${t}"]`;

const typeScriptMap: Record<string, string> = {
  Int: 'number',
  Float: 'number',
  Boolean: 'boolean',
  ID: 'string',
  String: 'string',
};
const toTypeScriptPrimitive = (a: string): string => typeScriptMap[a] || a;

const plusDescription = (description?: string, prefix = '') => (description ? `${prefix}/** ${description} */\n` : '');
const resolveArg = (f: ParserField) => {
  const {
    type: { options },
  } = f;
  const isArray = !!(options && options.find((o) => o === Options.array));
  const isArrayRequired = !!(options && options.find((o) => o === Options.arrayRequired));
  const isRequired = !!(options && options.find((o) => o === Options.required));
  const isRequiredName = (name: string) => {
    if ((isArray && isArrayRequired) || (isRequired && !isArray)) {
      return name;
    }
    return `${name}?`;
  };
  const concatArray = (name: string) => {
    if (isArray) {
      if (!isRequired) {
        return `(${name} | undefined)[]`;
      }
      return `${name}[]`;
    }
    return name;
  };
  const resolveArgsName = (name: string): string => {
    return isRequiredName(name) + ':';
  };
  return `${plusDescription(f.description, '\t')}\t${resolveArgsName(f.name)}${concatArray(
    f.type.name in typeScriptMap ? toTypeScriptPrimitive(f.type.name) : resolveValueType(f.type.name),
  )}`;
};
const resolveField = (f: ParserField, enumsAndScalars: string[]) => {
  const { args } = f;
  const resolvedTypeName =
    f.type.name in typeScriptMap || enumsAndScalars.includes(f.type.name) ? 'true' : resolveValueType(f.type.name);
  if (args && args.length) {
    return `${f.name}?: [{${args.map(resolveArg).join(',')}},${resolvedTypeName}]`;
  }
  return `${plusDescription(f.description, '\t')}\t${`${f.name}?` + ':'}${resolvedTypeName}`;
};

const AliasType = (code: string) => `AliasType<${code}>`;

const resolveValueTypeFromRoot = (i: ParserField, rootNodes: ParserField[], enumsAndScalars: string[]) => {
  if (i.data!.type === TypeSystemDefinition.DirectiveDefinition) {
    return '';
  }
  if (i.data!.type === Helpers.Comment) {
    return '';
  }
  if (!i.args || !i.args.length) {
    return `${plusDescription(i.description)}["${i.name}"]:unknown`;
  }
  if (i.data!.type === TypeDefinition.UnionTypeDefinition) {
    return `${plusDescription(i.description)}["${i.name}"]: ${AliasType(
      `{${i.args
        .map((f) => `\t\t["...on ${f.type.name}"] : ${resolveValueType(f.type.name)}`)
        .join(',\n')}\n\t\t__typename?: true\n}`,
    )}`;
  }
  if (i.data!.type === TypeDefinition.EnumTypeDefinition) {
    return `${plusDescription(i.description)}["${i.name}"]:${i.name}`;
  }
  if (i.data!.type === TypeDefinition.InputObjectTypeDefinition) {
    return `${plusDescription(i.description)}["${i.name}"]: {\n${i.args.map((f) => resolveArg(f)).join(',\n')}\n}`;
  }
  if (i.data!.type === TypeDefinition.InterfaceTypeDefinition) {
    const typesImplementing = rootNodes.filter((rn) => rn.interfaces && rn.interfaces.includes(i.name));
    return `${plusDescription(i.description)}["${i.name}"]:${AliasType(
      `{
\t${i.args.map((f) => resolveField(f, enumsAndScalars)).join(',\n')};\n\t\t${typesImplementing
        .map((f) => `['...on ${f.name}']: ${resolveValueType(f.name)};`)
        .join('\n\t\t')}\n\t\t__typename?: true\n}`,
    )}`;
  }
  return `${plusDescription(i.description)}["${i.name}"]: ${AliasType(
    `{\n${i.args.map((f) => resolveField(f, enumsAndScalars)).join(',\n')}\n\t\t__typename?: true\n}`,
  )}`;
};
export const resolveValueTypes = (rootNodes: ParserField[]) => {
  const enumsAndScalars = rootNodes
    .filter(
      (n) => n.data?.type === TypeDefinition.EnumTypeDefinition || n.data?.type === TypeDefinition.ScalarTypeDefinition,
    )
    .map((n) => n.name);
  return `export type ${VALUETYPES} = {
    ${rootNodes
      .map((f) => resolveValueTypeFromRoot(f, rootNodes, enumsAndScalars))
      .filter((v) => v)
      .join(';\n\t')}
  }`;
};
