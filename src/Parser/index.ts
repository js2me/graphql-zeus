import {
  buildASTSchema,
  DefinitionNode,
  DocumentNode,
  extendSchema,
  GraphQLSchema,
  isTypeSystemDefinitionNode,
  isTypeSystemExtensionNode,
  parse,
  printSchema,
} from 'graphql';
import { AllTypes, ParserField, ParserTree, TypeDefinitionDisplayMap } from '../Models';
import { Directive, Helpers, OperationType, TypeDefinition, TypeExtension } from '../Models/Spec';
import { TreeToGraphQL } from '../TreeToGraphQL';
import { TypeResolver } from './typeResolver';
export class Parser {
  static findComments(schema: string) {
    return schema
      .split('\n')
      .filter((s) => s.startsWith('#'))
      .map((s) => s.slice(1).trimStart());
  }
  /**
   * Parse schema from string and return ast
   *
   * @param schema
   */
  static importSchema = (schema: string): GraphQLSchema => buildASTSchema(parse(schema));
  static documentDefinitionToSerializedNodeTree = (d: DefinitionNode): ParserField | undefined => {
    if (isTypeSystemDefinitionNode(d) || isTypeSystemExtensionNode(d)) {
      if ('name' in d) {
        return {
          name: d.name!.value,
          type:
            d.kind === 'DirectiveDefinition'
              ? {
                  name: TypeDefinitionDisplayMap[d.kind],
                  directiveOptions: d.locations.map((l) => l.value as Directive),
                }
              : {
                  name: TypeDefinitionDisplayMap[d.kind],
                },
          data: {
            type: d.kind as AllTypes,
          },
          description: 'description' in d && d.description ? d.description!.value : '',
          interfaces: 'interfaces' in d && d.interfaces ? d.interfaces!.map((i) => i.name.value) : undefined,
          directives: 'directives' in d && d.directives ? TypeResolver.iterateDirectives(d.directives!) : undefined,
          args: TypeResolver.resolveFieldsFromDefinition(d),
        };
      }
    }
  };
  /**
   * Parse whole string GraphQL schema and return ParserTree
   *
   * @param schema GraphQL schema string
   * @param [excludeRoots=[]] param to exclude some node names from parsing in this schema
   * @returns
   */
  static parse = (schema: string, excludeRoots: string[] = []): ParserTree => {
    let parsedSchema: DocumentNode;
    let astSchema: GraphQLSchema;
    try {
      parsedSchema = parse(schema);
      astSchema = buildASTSchema(parsedSchema);
    } catch (error) {
      /* tslint:disable */ console.log(schema); /* tslint:disable */
    }
    const operations = {
      Query: astSchema!.getQueryType(),
      Mutation: astSchema!.getMutationType(),
      Subscription: astSchema!.getSubscriptionType(),
    };
    const nodes = parsedSchema!.definitions
      .filter((t) => 'name' in t && t.name && !excludeRoots.includes(t.name.value))
      .map(Parser.documentDefinitionToSerializedNodeTree)
      .filter((d) => !!d) as ParserField[];
    const comments: ParserField[] = Parser.findComments(schema).map(
      (description) =>
        ({
          name: Helpers.Comment,
          type: {
            name: Helpers.Comment,
          },
          data: {
            type: Helpers.Comment,
          },
          description,
        } as ParserField),
    );
    const nodeTree: ParserTree = {
      nodes: [...comments, ...nodes],
    };
    nodeTree.nodes.forEach((n) => {
      if (n.data!.type! === TypeDefinition.ObjectTypeDefinition) {
        if (operations.Query && operations.Query.name === n.name) {
          n.type.operations = [OperationType.query];
        }
        if (operations.Mutation && operations.Mutation.name === n.name) {
          n.type.operations = [OperationType.mutation];
        }
        if (operations.Subscription && operations.Subscription.name === n.name) {
          n.type.operations = [OperationType.subscription];
        }
      }
    });
    return nodeTree;
  };
  static parseAddExtensions = (schema: string, excludeRoots: string[] = []): ParserTree => {
    const parsed = Parser.parse(schema, excludeRoots);
    const Extensions = parsed.nodes.filter((n) => n.data && n.data.type! in TypeExtension);
    if (!Extensions || Extensions.length === 0) {
      return parsed;
    }
    const wihtoutExtensions = parsed.nodes.filter((n) => !(n.data && n.data.type! in TypeExtension));
    const schemaStringWithoutExtensions = TreeToGraphQL.parse({
      nodes: wihtoutExtensions,
    });
    const schemaStringWithExtensionsOnly = TreeToGraphQL.parse({
      nodes: Extensions,
    });
    const extendedSchemaString = printSchema(
      extendSchema(buildASTSchema(parse(schemaStringWithoutExtensions)), parse(schemaStringWithExtensionsOnly)),
    );
    return Parser.parse(extendedSchemaString);
  };
}
export * from './ParserUtils';
