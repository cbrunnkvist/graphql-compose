/* @flow strict */
/* eslint-disable no-use-before-define */

// import invariant from 'graphql/jsutils/invariant';
import {
  GraphQLUnionType,
  GraphQLObjectType,
  type GraphQLResolveInfo,
  type GraphQLTypeResolver,
} from './graphql';
import { isObject, isString, isFunction } from './utils/is';
import { inspect } from './utils/misc';
import {
  ObjectTypeComposer,
  type ObjectTypeComposerDefinition,
  type ObjectTypeComposerThunked,
} from './ObjectTypeComposer';
import type { TypeAsString, TypeDefinitionString } from './TypeMapper';
import { SchemaComposer } from './SchemaComposer';
import { TypeMapper } from './TypeMapper';
import { ListComposer } from './ListComposer';
import { NonNullComposer } from './NonNullComposer';
import { ThunkComposer } from './ThunkComposer';
import type {
  Thunk,
  Extensions,
  MaybePromise,
  ExtensionsDirective,
  DirectiveArgs,
} from './utils/definitions';
import { convertObjectTypeArrayAsThunk } from './utils/configToDefine';
import { getGraphQLType, getComposeTypeName } from './utils/typeHelpers';
import { graphqlVersion } from './utils/graphqlVersion';

export type UnionTypeComposerDefinition<TSource, TContext> =
  | TypeAsString
  | TypeDefinitionString
  | UnionTypeComposerAsObjectDefinition<TSource, TContext>
  | GraphQLUnionType;

export type UnionTypeComposerAsObjectDefinition<TSource, TContext> = {
  name: string,
  types?: Thunk<$ReadOnlyArray<ObjectTypeComposerDefinition<any, TContext>> | null>,
  resolveType?: GraphQLTypeResolver<TSource, TContext> | null,
  description?: string | null,
  extensions?: Extensions,
};

export type UnionTypeComposerResolversMap<TSource, TContext> = Map<
  ObjectTypeComposerThunked<TSource, TContext>,
  UnionTypeComposerResolverCheckFn<TSource, TContext>
>;

export type UnionTypeComposerResolversMapDefinition<TSource, TContext> =
  | Map<
      ObjectTypeComposerThunked<any, TContext> | ObjectTypeComposerDefinition<any, TContext>,
      UnionTypeComposerResolverCheckFn<TSource, TContext>
    >
  | $ReadOnly<UnionTypeComposerResolversMap<TSource, TContext>>;

export type UnionTypeComposerResolverCheckFn<TSource, TContext> = (
  value: TSource,
  context: TContext,
  info: GraphQLResolveInfo
) => MaybePromise<boolean | null | void>;

export type UnionTypeComposerThunked<TReturn, TContext> =
  | UnionTypeComposer<TReturn, TContext>
  | ThunkComposer<UnionTypeComposer<TReturn, TContext>, GraphQLUnionType>;

export class UnionTypeComposer<TSource, TContext> {
  schemaComposer: SchemaComposer<TContext>;
  _gqType: GraphQLUnionType;
  _gqcTypeMap: Map<string, ObjectTypeComposerThunked<any, TContext>>;
  _gqcTypeResolvers: UnionTypeComposerResolversMap<TSource, TContext>;
  _gqcExtensions: Extensions | void;

  // Also supported `GraphQLUnionType` but in such case Flowtype force developers
  // to explicitly write annotations in their code. But it's bad.
  static create<TSrc, TCtx>(
    typeDef: UnionTypeComposerDefinition<TSrc, TCtx>,
    schemaComposer: SchemaComposer<TCtx>
  ): UnionTypeComposer<TSrc, TCtx> {
    if (!(schemaComposer instanceof SchemaComposer)) {
      throw new Error(
        'You must provide SchemaComposer instance as a second argument for `UnionTypeComposer.create(typeDef, schemaComposer)`'
      );
    }

    if (schemaComposer.hasInstance(typeDef, UnionTypeComposer)) {
      return schemaComposer.getUTC(typeDef);
    }

    const utc = this.createTemp(typeDef, schemaComposer);
    schemaComposer.add(utc);
    return utc;
  }

  static createTemp<TSrc, TCtx>(
    typeDef: UnionTypeComposerDefinition<TSrc, TCtx>,
    schemaComposer?: SchemaComposer<TCtx>
  ): UnionTypeComposer<TSrc, TCtx> {
    const sc = schemaComposer || new SchemaComposer();
    let UTC;

    if (isString(typeDef)) {
      const typeName: string = typeDef;
      if (TypeMapper.isTypeNameString(typeName)) {
        UTC = new UnionTypeComposer(
          new GraphQLUnionType({
            name: typeName,
            types: () => [],
          }),
          sc
        );
      } else {
        UTC = sc.typeMapper.convertSDLTypeDefinition(typeName);
        if (!(UTC instanceof UnionTypeComposer)) {
          throw new Error(
            'You should provide correct GraphQLUnionType type definition. ' +
              'Eg. `union MyType = Photo | Person`'
          );
        }
      }
    } else if (typeDef instanceof GraphQLUnionType) {
      UTC = new UnionTypeComposer(typeDef, sc);
    } else if (isObject(typeDef)) {
      const type = new GraphQLUnionType({
        ...(typeDef: any),
        types: () => [],
      });
      UTC = new UnionTypeComposer(type, sc);

      const types = typeDef.types;
      if (Array.isArray(types)) UTC.setTypes(types);
      else if (isFunction(types)) {
        // rewrap interfaces `() => [i1, i2]` -> `[()=>i1, ()=>i2]`
        // helps to solve hoisting problems
        UTC.setTypes(convertObjectTypeArrayAsThunk((types: any), sc));
      }

      UTC._gqcExtensions = typeDef.extensions || {};
    } else {
      throw new Error(
        `You should provide GraphQLUnionTypeConfig or string with union name or SDL definition. Provided:\n${inspect(
          typeDef
        )}`
      );
    }

    return UTC;
  }

  constructor(
    graphqlType: GraphQLUnionType,
    schemaComposer: SchemaComposer<TContext>
  ): UnionTypeComposer<TSource, TContext> {
    if (!(schemaComposer instanceof SchemaComposer)) {
      throw new Error(
        'You must provide SchemaComposer instance as a second argument for `new UnionTypeComposer(GraphQLUnionType, SchemaComposer)`'
      );
    }
    if (!(graphqlType instanceof GraphQLUnionType)) {
      throw new Error(
        'UnionTypeComposer accept only GraphQLUnionType in constructor. Try to use more flexible method `UnionTypeComposer.create()`.'
      );
    }

    this.schemaComposer = schemaComposer;
    this._gqType = graphqlType;

    // add itself to TypeStorage on create
    // it avoids recursive type use errors
    this.schemaComposer.set(graphqlType, this);

    let types = [];
    if (graphqlVersion >= 14) {
      types = this._gqType._types;
    } else {
      types = this._gqType._types || (this._gqType: any)._typeConfig.types;
    }
    types = convertObjectTypeArrayAsThunk(types, this.schemaComposer);
    this._gqcTypeMap = new Map();
    types.forEach(type => {
      this._gqcTypeMap.set(type.getTypeName(), type);
    });

    if (!this._gqcTypeResolvers) {
      this._gqcTypeResolvers = new Map();
    }

    // alive proper Flow type casting in autosuggestions for class with Generics
    /* :: return this; */
  }

  // -----------------------------------------------
  // Union Types methods
  // -----------------------------------------------

  hasType(name: ObjectTypeComposerDefinition<any, TContext>): boolean {
    const typeName = getComposeTypeName(name);
    return this._gqcTypeMap.has(typeName);
  }

  getTypes(): Array<ObjectTypeComposerThunked<TSource, TContext>> {
    return Array.from(this._gqcTypeMap.values());
  }

  getTypeNames(): string[] {
    return Array.from(this._gqcTypeMap.keys());
  }

  clearTypes(): UnionTypeComposer<TSource, TContext> {
    this._gqcTypeMap.clear();
    return this;
  }

  setTypes(
    types: $ReadOnlyArray<
      ObjectTypeComposerThunked<TSource, TContext> | ObjectTypeComposerDefinition<any, TContext>
    >
  ): UnionTypeComposer<TSource, TContext> {
    this.clearTypes();
    const tcs = convertObjectTypeArrayAsThunk(types, this.schemaComposer);
    tcs.forEach(tc => {
      this._gqcTypeMap.set(tc.getTypeName(), tc);
    });
    return this;
  }

  addType(
    type: ObjectTypeComposerThunked<any, TContext> | ObjectTypeComposerDefinition<any, TContext>
  ): UnionTypeComposer<TSource, TContext> {
    const tc = this._convertObjectType(type);
    this._gqcTypeMap.set(tc.getTypeName(), tc);
    return this;
  }

  addTypes(
    types: $ReadOnlyArray<
      ObjectTypeComposerThunked<any, TContext> | ObjectTypeComposerDefinition<any, TContext>
    >
  ) {
    if (!Array.isArray(types)) {
      throw new Error(`UnionTypeComposer[${this.getTypeName()}].addType() accepts only array`);
    }
    types.forEach(type => this.addType(type));
    return this;
  }

  removeType(nameOrArray: string | string[]): UnionTypeComposer<TSource, TContext> {
    const typeNames = Array.isArray(nameOrArray) ? nameOrArray : [nameOrArray];
    typeNames.forEach(typeName => {
      this._gqcTypeMap.delete(typeName);
    });
    return this;
  }

  removeOtherTypes(nameOrArray: string | string[]): UnionTypeComposer<TSource, TContext> {
    const keepTypeNames = Array.isArray(nameOrArray) ? nameOrArray : [nameOrArray];
    this._gqcTypeMap.forEach((v, i) => {
      if (keepTypeNames.indexOf(i) === -1) {
        this._gqcTypeMap.delete(i);
      }
    });
    return this;
  }

  // -----------------------------------------------
  // Type methods
  // -----------------------------------------------

  getType(): GraphQLUnionType {
    const prepareTypes = () => {
      try {
        return this.getTypes().map(tc => tc.getType());
      } catch (e) {
        e.message = `UnionError[${this.getTypeName()}]: ${e.message}`;
        throw e;
      }
    };
    if (graphqlVersion >= 14) {
      this._gqType._types = prepareTypes;
    } else {
      (this._gqType: any)._types = null;
      (this._gqType: any)._typeConfig.types = prepareTypes;
    }
    return this._gqType;
  }

  getTypePlural(): ListComposer<UnionTypeComposer<TSource, TContext>> {
    return new ListComposer(this);
  }

  getTypeNonNull(): NonNullComposer<UnionTypeComposer<TSource, TContext>> {
    return new NonNullComposer(this);
  }

  getTypeName(): string {
    return this._gqType.name;
  }

  setTypeName(name: string): UnionTypeComposer<TSource, TContext> {
    this._gqType.name = name;
    this.schemaComposer.add(this);
    return this;
  }

  getDescription(): string {
    return this._gqType.description || '';
  }

  setDescription(description: string): UnionTypeComposer<TSource, TContext> {
    this._gqType.description = description;
    return this;
  }

  /**
   * You may clone this type with a new provided name as string.
   * Or you may provide a new TypeComposer which will get all clonned
   * settings from this type.
   */
  clone(
    newTypeNameOrTC: string | UnionTypeComposer<any, any>
  ): UnionTypeComposer<TSource, TContext> {
    if (!newTypeNameOrTC) {
      throw new Error('You should provide newTypeName:string for UnionTypeComposer.clone()');
    }

    const cloned =
      newTypeNameOrTC instanceof UnionTypeComposer
        ? newTypeNameOrTC
        : UnionTypeComposer.create(newTypeNameOrTC, this.schemaComposer);

    cloned._gqcExtensions = { ...this._gqcExtensions };
    cloned._gqcTypeMap = new Map(this._gqcTypeMap);
    cloned._gqcTypeResolvers = new Map(this._gqcTypeResolvers);
    cloned.setDescription(this.getDescription());

    return cloned;
  }

  merge(
    type: GraphQLUnionType | UnionTypeComposer<any, any>
  ): UnionTypeComposer<TSource, TContext> {
    let tc: ?UnionTypeComposer<any, any>;

    if (type instanceof GraphQLUnionType) {
      tc = UnionTypeComposer.createTemp(type, this.schemaComposer);
    } else if (type instanceof UnionTypeComposer) {
      tc = type;
    }

    if (tc) {
      this.addTypes(tc.getTypes());
    } else {
      throw new Error(
        `Cannot merge ${inspect(
          type
        )} with UnionType(${this.getTypeName()}). Provided type should be GraphQLUnionType or UnionTypeComposer.`
      );
    }

    return this;
  }

  // -----------------------------------------------
  // ResolveType methods
  // -----------------------------------------------

  getResolveType(): GraphQLTypeResolver<TSource, TContext> | void | null {
    return (this._gqType.resolveType: any);
  }

  setResolveType(
    fn: GraphQLTypeResolver<TSource, TContext> | void | null
  ): UnionTypeComposer<TSource, TContext> {
    this._gqType.resolveType = fn;
    return this;
  }

  hasTypeResolver(
    type: ObjectTypeComposerThunked<any, TContext> | ObjectTypeComposerDefinition<any, TContext>
  ): boolean {
    const typeResolversMap = this.getTypeResolvers();
    const tc = this._convertObjectType(type);
    return typeResolversMap.has(tc);
  }

  getTypeResolvers(): UnionTypeComposerResolversMap<TSource, TContext> {
    return this._gqcTypeResolvers;
  }

  getTypeResolverCheckFn(
    type: ObjectTypeComposerThunked<any, TContext> | ObjectTypeComposerDefinition<any, TContext>
  ): UnionTypeComposerResolverCheckFn<any, TContext> {
    const typeResolversMap = this.getTypeResolvers();
    const tc = this._convertObjectType(type);

    if (!typeResolversMap.has(tc)) {
      throw new Error(
        `Type resolve function in union '${this.getTypeName()}' is not defined for type ${inspect(
          type
        )}.`
      );
    }

    return (typeResolversMap.get(tc): any);
  }

  getTypeResolverNames(): string[] {
    const typeResolversMap = this.getTypeResolvers();
    const names = [];
    typeResolversMap.forEach((resolveFn, tc) => {
      names.push(tc.getTypeName());
    });
    return names;
  }

  getTypeResolverTypes(): Array<ObjectTypeComposerThunked<any, TContext>> {
    const typeResolversMap = this.getTypeResolvers();
    return Array.from(typeResolversMap.keys());
  }

  setTypeResolvers(
    typeResolversMap: UnionTypeComposerResolversMapDefinition<TSource, TContext>
  ): UnionTypeComposer<TSource, TContext> {
    this._gqcTypeResolvers = this._convertTypeResolvers(typeResolversMap);

    // extract GraphQLObjectType from ObjectTypeComposer
    const fastEntries = [];
    for (const [composeType, checkFn] of this._gqcTypeResolvers.entries()) {
      fastEntries.push([((getGraphQLType(composeType): any): GraphQLObjectType), checkFn]);
      this.addType(composeType);
    }

    let resolveType;
    const isAsyncRuntime = this._isTypeResolversAsync(this._gqcTypeResolvers);
    if (isAsyncRuntime) {
      resolveType = async (value, context, info) => {
        for (const [_gqType, checkFn] of fastEntries) {
          // should we run checkFn simultaniously or in serial?
          // Current decision is: dont SPIKE event loop - run in serial (it may be changed in future)
          // eslint-disable-next-line no-await-in-loop
          if (await checkFn(value, context, info)) return _gqType;
        }
        return null;
      };
    } else {
      resolveType = (value, context, info) => {
        for (const [_gqType, checkFn] of fastEntries) {
          if (checkFn(value, context, info)) return _gqType;
        }
        return null;
      };
    }

    this.setResolveType(resolveType);
    return this;
  }

  _convertObjectType(
    type: ObjectTypeComposerThunked<any, TContext> | ObjectTypeComposerDefinition<any, TContext>
  ): ObjectTypeComposerThunked<any, TContext> {
    const tc = this.schemaComposer.typeMapper.convertOutputTypeDefinition((type: any));
    if (tc instanceof ObjectTypeComposer || tc instanceof ThunkComposer) {
      return (tc: any);
    }
    throw new Error(`Should be provided ObjectType but recieved ${inspect(type)}`);
  }

  _convertTypeResolvers(
    typeResolversMap: UnionTypeComposerResolversMapDefinition<any, TContext>
  ): UnionTypeComposerResolversMap<any, TContext> {
    if (!(typeResolversMap instanceof Map)) {
      throw new Error(
        `For union ${this.getTypeName()} you should provide Map object for type resolvers.`
      );
    }

    const result = new Map();
    for (const [composeType, checkFn] of typeResolversMap.entries()) {
      // checking composeType
      try {
        result.set(this._convertObjectType(composeType), checkFn);
      } catch (e) {
        throw new Error(
          `For union type resolver ${this.getTypeName()} you must provide GraphQLObjectType or ObjectTypeComposer, but provided ${inspect(
            composeType
          )}`
        );
      }

      // checking checkFn
      if (!isFunction(checkFn)) {
        throw new Error(
          `Union ${this.getTypeName()} has invalid check function for type ${inspect(composeType)}`
        );
      }
    }

    return result;
  }

  // eslint-disable-next-line class-methods-use-this
  _isTypeResolversAsync(typeResolversMap: UnionTypeComposerResolversMap<any, TContext>): boolean {
    let res = false;
    for (const [, checkFn] of typeResolversMap.entries()) {
      try {
        const r = checkFn(({}: any), ({}: any), ({}: any));
        if (r instanceof Promise) {
          r.catch(() => {});
          res = true;
        }
      } catch (e) {
        // noop
      }
    }
    return res;
  }

  addTypeResolver(
    type: ObjectTypeComposerDefinition<any, TContext>,
    checkFn: UnionTypeComposerResolverCheckFn<TSource, TContext>
  ): UnionTypeComposer<TSource, TContext> {
    const typeResolversMap = this.getTypeResolvers();
    const tc = this._convertObjectType(type);
    typeResolversMap.set(tc, checkFn);
    this.setTypeResolvers(typeResolversMap);
    return this;
  }

  removeTypeResolver(
    type: ObjectTypeComposerDefinition<any, TContext>
  ): UnionTypeComposer<TSource, TContext> {
    const typeResolversMap = this.getTypeResolvers();
    const tc = this._convertObjectType(type);
    typeResolversMap.delete(tc);
    this.setTypeResolvers(typeResolversMap);
    return this;
  }

  // -----------------------------------------------
  // Extensions methods
  // -----------------------------------------------

  getExtensions(): Extensions {
    if (!this._gqcExtensions) {
      return {};
    } else {
      return this._gqcExtensions;
    }
  }

  setExtensions(extensions: Extensions): UnionTypeComposer<TSource, TContext> {
    this._gqcExtensions = extensions;
    return this;
  }

  extendExtensions(extensions: Extensions): UnionTypeComposer<TSource, TContext> {
    const current = this.getExtensions();
    this.setExtensions({
      ...current,
      ...extensions,
    });
    return this;
  }

  clearExtensions(): UnionTypeComposer<TSource, TContext> {
    this.setExtensions({});
    return this;
  }

  getExtension(extensionName: string): ?any {
    const extensions = this.getExtensions();
    return extensions[extensionName];
  }

  hasExtension(extensionName: string): boolean {
    const extensions = this.getExtensions();
    return extensionName in extensions;
  }

  setExtension(extensionName: string, value: any): UnionTypeComposer<TSource, TContext> {
    this.extendExtensions({
      [extensionName]: value,
    });
    return this;
  }

  removeExtension(extensionName: string): UnionTypeComposer<TSource, TContext> {
    const extensions = { ...this.getExtensions() };
    delete extensions[extensionName];
    this.setExtensions(extensions);
    return this;
  }

  // -----------------------------------------------
  // Directive methods
  // -----------------------------------------------

  getDirectives(): Array<ExtensionsDirective> {
    const directives = this.getExtension('directives');
    if (Array.isArray(directives)) {
      return directives;
    }
    return [];
  }

  getDirectiveNames(): string[] {
    return this.getDirectives().map(d => d.name);
  }

  getDirectiveByName(directiveName: string): ?DirectiveArgs {
    const directive = this.getDirectives().find(d => d.name === directiveName);
    if (!directive) return undefined;
    return directive.args;
  }

  getDirectiveById(idx: number): ?DirectiveArgs {
    const directive = this.getDirectives()[idx];
    if (!directive) return undefined;
    return directive.args;
  }

  // -----------------------------------------------
  // Misc methods
  // -----------------------------------------------

  // get(path: string | string[]): any {
  //   return typeByPath(this, path);
  // }
}
