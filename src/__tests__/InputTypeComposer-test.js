/* @flow strict */

import {
  GraphQLInputObjectType,
  GraphQLString,
  GraphQLList,
  GraphQLNonNull,
  GraphQLInt,
  GraphQLBoolean,
} from '../graphql';
import { schemaComposer, SchemaComposer } from '..';
import { InputTypeComposer } from '../InputTypeComposer';
import { ScalarTypeComposer } from '../ScalarTypeComposer';
import { EnumTypeComposer } from '../EnumTypeComposer';
import { ListComposer } from '../ListComposer';
import { NonNullComposer } from '../NonNullComposer';
import { ThunkComposer } from '../ThunkComposer';
import { graphqlVersion } from '../utils/graphqlVersion';

beforeEach(() => {
  schemaComposer.clear();
});

describe('InputTypeComposer', () => {
  let objectType: GraphQLInputObjectType;
  let itc: InputTypeComposer<any>;

  beforeEach(() => {
    objectType = new GraphQLInputObjectType({
      name: 'InputType',
      description: 'Mock type',
      fields: {
        input1: { type: GraphQLString },
        input2: { type: GraphQLString },
      },
    });
    itc = new InputTypeComposer(objectType, schemaComposer);
  });

  describe('field manipulation methods', () => {
    it('getFields()', () => {
      const fieldNames = Object.keys(itc.getFields());
      expect(fieldNames).toEqual(expect.arrayContaining(['input1', 'input2']));
    });

    it('getFieldNames()', () => {
      expect(itc.getFieldNames()).toEqual(expect.arrayContaining(['input1', 'input2']));
    });

    describe('getField()', () => {
      it('should return field config', () => {
        expect(itc.getFieldType('input1')).toBe(GraphQLString);
      });

      it('should throw error if field does not exist', () => {
        expect(() => itc.getField('unexisted')).toThrowError(/Cannot get field.*does not exist/);
      });
    });

    it('hasField()', () => {
      expect(itc.hasField('input1')).toBe(true);
      expect(itc.hasField('missing')).toBe(false);
    });

    it('setField()', () => {
      itc.setField('input3', { type: GraphQLString });
      const fieldNames = Object.keys(itc.getType().getFields());
      expect(fieldNames).toContain('input3');
    });

    describe('setFields()', () => {
      it('accept regular fields definition', () => {
        itc.setFields({
          input3: { type: GraphQLString },
          input4: { type: GraphQLString },
        });
        expect(itc.getFieldNames()).not.toEqual(expect.arrayContaining(['input1', 'input2']));
        expect(itc.getFieldNames()).toEqual(expect.arrayContaining(['input3', 'input4']));
        expect(itc.getFieldType('input3')).toBe(GraphQLString);
        expect(itc.getFieldType('input4')).toBe(GraphQLString);
      });

      it('accept shortand fields definition', () => {
        itc.setFields({
          input3: GraphQLString,
          input4: 'String',
        });
        expect(itc.getFieldType('input3')).toBe(GraphQLString);
        expect(itc.getFieldType('input4')).toBe(GraphQLString);
      });

      it('accept types as function', () => {
        const typeAsFn = () => GraphQLString;
        itc.setFields({
          input3: { type: typeAsFn },
        });
        expect(itc.getField('input3').type).toBeInstanceOf(ThunkComposer);
        expect(itc.getFieldType('input3')).toBe(GraphQLString);

        // show provide unwrapped/unhoisted type for graphql
        if (graphqlVersion >= 14) {
          expect((itc.getType(): any)._fields().input3.type).toBe(GraphQLString);
        } else {
          expect((itc.getType(): any)._typeConfig.fields().input3.type).toBe(GraphQLString);
        }
      });
    });

    it('addFields()', () => {
      itc.addFields({
        input3: { type: GraphQLString },
        input4: { type: GraphQLString },
      });
      expect(itc.getFieldNames()).toEqual(
        expect.arrayContaining(['input1', 'input2', 'input3', 'input4'])
      );
    });

    it('addNestedFields()', () => {
      itc.addNestedFields({
        'fieldNested1.f1': { type: GraphQLString },
        fieldNested2: { type: '[Int]' },
        'fieldNested1.f2': 'Boolean!',
      });

      expect(itc.getFieldType('fieldNested1')).toBeInstanceOf(GraphQLInputObjectType);
      const fieldTC = itc.getFieldTC('fieldNested1');
      expect(fieldTC).toBeInstanceOf(InputTypeComposer);
      if (fieldTC instanceof InputTypeComposer) {
        expect(fieldTC.getTypeName()).toBe('InputTypeFieldNested1');
        expect(fieldTC.getFieldType('f1')).toBe(GraphQLString);
        expect(fieldTC.getFieldType('f2')).toBeInstanceOf(GraphQLNonNull);
        expect((fieldTC.getFieldType('f2'): any).ofType).toBe(GraphQLBoolean);

        expect(itc.getFieldType('fieldNested2')).toBeInstanceOf(GraphQLList);
        expect((itc.getFieldType('fieldNested2'): any).ofType).toBe(GraphQLInt);
      }
    });

    it('removeField()', () => {
      itc.removeField('input1');
      expect(itc.getFieldNames()).not.toContain('input1');
      expect(itc.getFieldNames()).toContain('input2');
      itc.removeField(['input2', 'input3']);
      expect(itc.getFieldNames()).not.toContain('input2');
    });

    it('removeOtherFields()', () => {
      const cfg = {
        name: 'MyInput',
        fields: {
          input1: 'String',
          input2: 'String',
          input3: 'String',
        },
      };
      const itc1 = schemaComposer.createInputTC(cfg);
      itc1.removeOtherFields('input1');
      expect(itc1.getFieldNames()).toEqual(expect.arrayContaining(['input1']));
      expect(itc1.getFieldNames()).not.toEqual(expect.arrayContaining(['input2', 'input3']));

      const itc2 = schemaComposer.createInputTC(cfg);
      itc2.removeOtherFields(['input1', 'input2']);
      expect(itc2.getFieldNames()).toEqual(expect.arrayContaining(['input1', 'input2']));
      expect(itc2.getFieldNames()).not.toEqual(expect.arrayContaining(['input3']));
    });

    describe('reorderFields()', () => {
      it('should change fields order', () => {
        const itcOrder = schemaComposer.createInputTC({
          name: 'Type',
          fields: { f1: 'Int', f2: 'Int', f3: 'Int ' },
        });
        expect(itcOrder.getFieldNames().join(',')).toBe('f1,f2,f3');
        itcOrder.reorderFields(['f3', 'f2', 'f1']);
        expect(itcOrder.getFieldNames().join(',')).toBe('f3,f2,f1');
      });

      it('should append not listed fields', () => {
        const itcOrder = schemaComposer.createInputTC({
          name: 'Type',
          fields: { f1: 'Int', f2: 'Int', f3: 'Int ' },
        });
        expect(itcOrder.getFieldNames().join(',')).toBe('f1,f2,f3');
        itcOrder.reorderFields(['f3']);
        expect(itcOrder.getFieldNames().join(',')).toBe('f3,f1,f2');
      });

      it('should skip non existed fields', () => {
        const itcOrder = schemaComposer.createInputTC({
          name: 'Type',
          fields: { f1: 'Int', f2: 'Int', f3: 'Int ' },
        });
        expect(itcOrder.getFieldNames().join(',')).toBe('f1,f2,f3');
        itcOrder.reorderFields(['f22', 'f3', 'f55', 'f1', 'f2']);
        expect(itcOrder.getFieldNames().join(',')).toBe('f3,f1,f2');
      });
    });

    describe('should extend field by name', () => {
      it('should extend existed fields', () => {
        itc.setField('input3', {
          type: GraphQLString,
        });
        itc.extendField('input3', {
          description: 'this is input #3',
        });
        expect(itc.getFieldConfig('input3').type).toBe(GraphQLString);
        expect(itc.getFieldConfig('input3').description).toBe('this is input #3');
        itc.extendField('input3', {
          type: 'Int',
        });
        expect(itc.getFieldConfig('input3').type).toBe(GraphQLInt);
      });

      it('should extend field extensions', () => {
        itc.setField('input3', {
          type: GraphQLString,
          extensions: { first: true },
        });
        itc.extendField('input3', {
          description: 'this is field #3',
          extensions: { second: true },
        });
        // $FlowFixMe
        expect(itc.getFieldConfig('input3').extensions).toEqual({
          first: true,
          second: true,
        });
      });

      it('should work with fieldConfig as string', () => {
        itc.setField('field4', 'String');
        itc.extendField('field4', {
          description: 'this is field #4',
        });
        expect(itc.getFieldConfig('field4').type).toBe(GraphQLString);
        expect(itc.getFieldConfig('field4').description).toBe('this is field #4');
      });

      it('should throw error if field does not exists', () => {
        expect(() => itc.extendField('unexisted', { description: '123' })).toThrow(
          /Cannot extend field.*Field does not exist/
        );
      });
    });

    it('getFieldType()', () => {
      expect(itc.getFieldType('input1')).toBe(GraphQLString);
    });

    it('isFieldNonNull()', () => {
      itc.setField('input1', 'String');
      expect(itc.isFieldNonNull('input1')).toBe(false);
      itc.setField('input1', 'String!');
      expect(itc.isFieldNonNull('input1')).toBe(true);
    });

    it('makeFieldNonNull()', () => {
      itc.makeFieldNonNull('input1');
      expect(itc.getFieldType('input1')).toBeInstanceOf(GraphQLNonNull);
      expect((itc.getFieldType('input1'): any).ofType).toBe(GraphQLString);
      expect(itc.isFieldNonNull('input1')).toBe(true);
    });

    it('makeRequired()', () => {
      itc.setField('input1', 'String');
      itc.makeRequired('input1');
      expect(itc.isFieldNonNull('input1')).toBe(true);
    });

    it('makeFieldNullable()', () => {
      itc.makeFieldNonNull('input1');
      expect(itc.isFieldNonNull('input1')).toBe(true);
      itc.makeFieldNullable('input1');
      expect(itc.isFieldNonNull('input1')).toBe(false);
    });

    it('makeOptional()', () => {
      itc.makeRequired('input1');
      expect(itc.isFieldNonNull('input1')).toBe(true);
      itc.makeOptional('input1');
      expect(itc.isFieldNonNull('input1')).toBe(false);
    });

    it('check Plural methods, wrap/unwrap from ListComposer', () => {
      itc.setFields({
        b1: { type: new GraphQLNonNull(GraphQLString) },
        b2: { type: '[String]' },
        b3: 'String!',
        b4: '[String!]!',
      });
      expect(itc.isFieldPlural('b1')).toBe(false);
      expect(itc.isFieldPlural('b2')).toBe(true);
      expect(itc.isFieldPlural('b3')).toBe(false);
      expect(itc.isFieldPlural('b4')).toBe(true);
      expect(itc.isFieldNonNull('b1')).toBe(true);
      expect(itc.isFieldNonNull('b2')).toBe(false);
      expect(itc.isFieldNonNull('b3')).toBe(true);
      expect(itc.isFieldNonNull('b4')).toBe(true);

      itc.makeFieldPlural(['b1', 'b2', 'b3', 'unexisted']);
      expect(itc.isFieldPlural('b1')).toBe(true);
      expect(itc.isFieldPlural('b2')).toBe(true);
      expect(itc.isFieldPlural('b3')).toBe(true);

      itc.makeFieldNonNull('b2');
      expect(itc.isFieldPlural('b2')).toBe(true);
      expect(itc.isFieldNonNull('b2')).toBe(true);
      itc.makeFieldNonPlural(['b2', 'b4', 'unexisted']);
      expect(itc.isFieldPlural('b2')).toBe(false);
      expect(itc.isFieldNonNull('b2')).toBe(true);
      expect(itc.isFieldPlural('b4')).toBe(false);
      itc.makeFieldNullable(['b2', 'b4', 'unexisted']);
      expect(itc.isFieldNonNull('b2')).toBe(false);
      expect(itc.isFieldNonNull('b4')).toBe(false);
    });

    it('should add fields with converting types from string to object', () => {
      itc.setField('input3', { type: 'String' });
      itc.addFields({
        input4: { type: '[Int]' },
        input5: { type: 'Boolean!' },
      });

      expect(itc.getFieldType('input3')).toBe(GraphQLString);
      expect(itc.getFieldType('input4')).toBeInstanceOf(GraphQLList);
      expect((itc.getFieldType('input4'): any).ofType).toBe(GraphQLInt);
      expect(itc.getFieldType('input5')).toBeInstanceOf(GraphQLNonNull);
      expect((itc.getFieldType('input5'): any).ofType).toBe(GraphQLBoolean);
      expect(itc.getFieldTypeName('input3')).toBe('String');
      expect(itc.getFieldTypeName('input4')).toBe('[Int]');
      expect(itc.getFieldTypeName('input5')).toBe('Boolean!');
    });
  });

  describe('type manipulation methods', () => {
    it('getType()', () => {
      expect(itc.getType()).toBeInstanceOf(GraphQLInputObjectType);
      expect(itc.getType().name).toBe('InputType');
    });

    it('getTypeNonNull()', () => {
      expect(itc.getTypeNonNull()).toBeInstanceOf(NonNullComposer);
      expect(itc.getTypeNonNull().getTypeName()).toBe('InputType!');
    });

    it('getTypePlural()', () => {
      expect(itc.getTypePlural()).toBeInstanceOf(ListComposer);
      expect(itc.getTypePlural().getTypeName()).toBe('[InputType]');
    });

    it('getTypeName()', () => {
      expect(itc.getTypeName()).toBe('InputType');
    });

    it('setTypeName()', () => {
      itc.setTypeName('OtherInputType');
      expect(itc.getTypeName()).toBe('OtherInputType');
    });

    it('getDescription()', () => {
      expect(itc.getDescription()).toBe('Mock type');
    });

    it('setDescription()', () => {
      itc.setDescription('Changed description');
      expect(itc.getDescription()).toBe('Changed description');
    });
  });

  describe('static method create()', () => {
    it('should create ITC by typeName as a string', () => {
      const itc1 = schemaComposer.createInputTC('TypeStub');
      expect(itc1).toBeInstanceOf(InputTypeComposer);
      expect(itc1.getType()).toBeInstanceOf(GraphQLInputObjectType);
      expect(itc1.getFields()).toEqual({});
    });

    it('should create ITC by type template string', () => {
      const itc1 = schemaComposer.createInputTC(
        `
        input TestTypeTplInput {
          f1: String @default(value: "new")
          # Description for some required Int field
          f2: Int!
        }
      `
      );
      expect(itc1).toBeInstanceOf(InputTypeComposer);
      expect(itc1.getTypeName()).toBe('TestTypeTplInput');
      expect(itc1.getFieldType('f1')).toBe(GraphQLString);
      expect((itc1.getField('f1'): any).defaultValue).toBe('new');
      expect(itc1.getFieldType('f2')).toBeInstanceOf(GraphQLNonNull);
      expect((itc1.getFieldType('f2'): any).ofType).toBe(GraphQLInt);
    });

    it('should create ITC by GraphQLObjectTypeConfig', () => {
      const itc1 = schemaComposer.createInputTC({
        name: 'TestTypeInput',
        fields: {
          f1: {
            type: 'String',
          },
          f2: 'Int!',
        },
      });
      expect(itc1).toBeInstanceOf(InputTypeComposer);
      expect(itc1.getFieldType('f1')).toBe(GraphQLString);
      expect(itc1.getFieldType('f2')).toBeInstanceOf(GraphQLNonNull);
      expect((itc1.getFieldType('f2'): any).ofType).toBe(GraphQLInt);
    });

    it('should create ITC by ComposeObjectTypeConfig with unexisted types', () => {
      const itc1 = schemaComposer.createInputTC({
        name: 'TestTypeInput',
        fields: {
          f1: {
            type: 'Type1',
          },
          f2: 'Type2!',
        },
      });
      expect(itc1).toBeInstanceOf(InputTypeComposer);
      expect(itc1.getField('f1').type).toBeInstanceOf(ThunkComposer);
      expect(() => itc1.getFieldTC('f1').getTypeName()).toThrow(
        'Type with name "Type1" does not exists'
      );
      expect(itc1.isFieldNonNull('f1')).toBeFalsy();
      expect(itc1.getField('f2').type).toBeInstanceOf(NonNullComposer);
      expect((itc1.getField('f2').type: any).ofType).toBeInstanceOf(ThunkComposer);
      expect(itc1.getField('f2').type.getTypeName()).toEqual('Type2!');
      expect(itc1.isFieldNonNull('f2')).toBeTruthy();
    });

    it('should create ITC by GraphQLObjectTypeConfig with fields as Thunk', () => {
      const itc1: any = schemaComposer.createInputTC({
        name: 'TestTypeInput',
        fields: (): any => ({
          f1: {
            type: 'String',
          },
          f2: 'Int!',
        }),
      });
      expect(itc1).toBeInstanceOf(InputTypeComposer);
      expect(itc1.getField('f1').type).toBeInstanceOf(ThunkComposer);
      expect(itc1.getFieldType('f1')).toBe(GraphQLString);
      expect(itc1.getFieldType('f2')).toBeInstanceOf(GraphQLNonNull);
      expect(itc1.getFieldType('f2').ofType).toBe(GraphQLInt);
    });

    it('should create ITC by GraphQLInputObjectType', () => {
      const objType = new GraphQLInputObjectType({
        name: 'TestTypeObj',
        fields: {
          f1: {
            type: GraphQLString,
          },
        },
      });
      const itc1 = schemaComposer.createInputTC(objType);
      expect(itc1).toBeInstanceOf(InputTypeComposer);
      expect(itc1.getType()).toBe(objType);
      expect(itc1.getFieldType('f1')).toBe(GraphQLString);
    });

    it('should create type and store it in schemaComposer', () => {
      const SomeUserITC = schemaComposer.createInputTC('SomeUserInput');
      expect(schemaComposer.getITC('SomeUserInput')).toBe(SomeUserITC);
    });

    it('createTemp() should not store type in schemaComposer', () => {
      InputTypeComposer.createTemp('SomeUserInput');
      expect(schemaComposer.has('SomeUserInput')).toBeFalsy();
    });
  });

  it('get() should return type by path', () => {
    const itc1: any = new InputTypeComposer(
      new GraphQLInputObjectType({
        name: 'Writable',
        fields: {
          field1: {
            type: GraphQLString,
          },
        },
      }),
      schemaComposer
    );

    expect(itc1.get('field1').getType()).toBe(GraphQLString);
  });

  it('should have chainable methods', () => {
    const itc1 = schemaComposer.createInputTC('InputType');
    expect(itc1.setFields({})).toBe(itc1);
    expect(itc1.setField('f1', 'String')).toBe(itc1);
    expect(itc1.extendField('f1', {})).toBe(itc1);
    expect(itc1.addFields({})).toBe(itc1);
    expect(itc1.removeField('f1')).toBe(itc1);
    expect(itc1.removeOtherFields('f1')).toBe(itc1);
    expect(itc1.reorderFields(['f1'])).toBe(itc1);
    expect(itc1.makeRequired('f1')).toBe(itc1);
    expect(itc1.makeOptional('f1')).toBe(itc1);
    expect(itc1.setTypeName('InputType2')).toBe(itc1);
    expect(itc1.setDescription('Test')).toBe(itc1);
  });

  describe('getFieldTC()', () => {
    const myITC = schemaComposer.createInputTC('MyCustomInputType');
    myITC.addFields({
      scalar: 'String',
      list: '[Int]',
      obj: schemaComposer.createInputTC(`input MyInputType { name: String }`),
      objArr: [schemaComposer.createInputTC(`input MyInputType2 { name: String }`)],
      enum: schemaComposer.createEnumTC(`enum MyEnumType { FOO BAR }`),
    });

    it('should return TypeComposer for object field', () => {
      const tco = myITC.getFieldTC('obj');
      expect(tco).toBeInstanceOf(InputTypeComposer);
      expect(tco.getTypeName()).toBe('MyInputType');
    });

    it('should return TypeComposer for wrapped object field', () => {
      const tco = myITC.getFieldTC('objArr');
      expect(tco).toBeInstanceOf(InputTypeComposer);
      expect(tco.getTypeName()).toBe('MyInputType2');
      // schould return the same TypeComposer instance
      const tco2 = myITC.getFieldITC('objArr');
      expect(tco).toBe(tco2);
    });

    it('should return TypeComposer for scalar fields', () => {
      const tco = myITC.getFieldTC('scalar');
      expect(tco).toBeInstanceOf(ScalarTypeComposer);
      expect(tco.getTypeName()).toBe('String');
    });

    it('should return TypeComposer for scalar list fields', () => {
      const tco = myITC.getFieldTC('list');
      expect(tco).toBeInstanceOf(ScalarTypeComposer);
      expect(tco.getTypeName()).toBe('Int');
    });

    it('should return TypeComposer for interface list fields', () => {
      const tco = myITC.getFieldTC('enum');
      expect(tco).toBeInstanceOf(EnumTypeComposer);
      expect(tco.getTypeName()).toBe('MyEnumType');
    });
  });

  describe('directive methods', () => {
    it('type level directive methods', () => {
      const tc1 = schemaComposer.createInputTC(`
        input My1 @d0(a: false) @d1(b: "3") @d0(a: true) { 
          field: Int
        }`);
      expect(tc1.getDirectives()).toEqual([
        { args: { a: false }, name: 'd0' },
        { args: { b: '3' }, name: 'd1' },
        { args: { a: true }, name: 'd0' },
      ]);
      expect(tc1.getDirectiveNames()).toEqual(['d0', 'd1', 'd0']);
      expect(tc1.getDirectiveByName('d0')).toEqual({ a: false });
      expect(tc1.getDirectiveById(0)).toEqual({ a: false });
      expect(tc1.getDirectiveByName('d1')).toEqual({ b: '3' });
      expect(tc1.getDirectiveById(1)).toEqual({ b: '3' });
      expect(tc1.getDirectiveByName('d2')).toEqual(undefined);
      expect(tc1.getDirectiveById(333)).toEqual(undefined);
    });

    it('field level directive methods', () => {
      const tc1 = schemaComposer.createInputTC(`
        input My1 { 
          field: Int @f0(a: false) @f1(b: "3") @f0(a: true)
        }`);
      expect(tc1.getFieldDirectives('field')).toEqual([
        { args: { a: false }, name: 'f0' },
        { args: { b: '3' }, name: 'f1' },
        { args: { a: true }, name: 'f0' },
      ]);
      expect(tc1.getFieldDirectiveNames('field')).toEqual(['f0', 'f1', 'f0']);
      expect(tc1.getFieldDirectiveByName('field', 'f0')).toEqual({ a: false });
      expect(tc1.getFieldDirectiveById('field', 0)).toEqual({ a: false });
      expect(tc1.getFieldDirectiveByName('field', 'f1')).toEqual({ b: '3' });
      expect(tc1.getFieldDirectiveById('field', 1)).toEqual({ b: '3' });
      expect(tc1.getFieldDirectiveByName('field', 'f2')).toEqual(undefined);
      expect(tc1.getFieldDirectiveById('field', 333)).toEqual(undefined);
    });
  });

  describe('merge()', () => {
    it('should merge with GraphQLInputObjectType', () => {
      const filterITC = schemaComposer.createInputTC(`input Filter { name: String }`);
      const filter2 = new GraphQLInputObjectType({
        name: 'Filter2',
        fields: {
          age: { type: GraphQLInt },
        },
      });
      filterITC.merge(filter2);
      expect(filterITC.getFieldNames()).toEqual(['name', 'age']);
    });

    it('should merge with InputTypeComposer', () => {
      const filterITC = schemaComposer.createInputTC(`input Filter { name: String }`);
      const sc2 = new SchemaComposer();
      const itc2 = sc2.createInputTC(`input Filter2 { age: Int }`);
      filterITC.merge(itc2);
      expect(filterITC.getFieldNames()).toEqual(['name', 'age']);
    });

    it('should throw error on wrong type', () => {
      const filterITC = schemaComposer.createInputTC(`input Filter { name: String }`);
      expect(() => filterITC.merge((schemaComposer.createScalarTC('Scalar'): any))).toThrow(
        'Cannot merge ScalarTypeComposer'
      );
    });
  });
});
