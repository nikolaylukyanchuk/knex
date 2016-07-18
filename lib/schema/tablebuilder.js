
// TableBuilder

// Takes the function passed to the "createTable" or "table/editTable"
// functions and calls it with the "TableBuilder" as both the context and
// the first argument. Inside this function we can specify what happens to the
// method, pushing everything we want to do onto the "allStatements" array,
// which is then compiled into sql.
// ------
'use strict';

exports.__esModule = true;

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj['default'] = obj; return newObj; } }

var _lodash = require('lodash');

var _helpers = require('../helpers');

var helpers = _interopRequireWildcard(_helpers);

function TableBuilder(client, method, tableName, fn) {
  this.client = client;
  this._fn = fn;
  this._method = method;
  this._schemaName = undefined;
  this._tableName = tableName;
  this._statements = [];
  this._single = {};

  if (!_lodash.isFunction(this._fn)) {
    throw new TypeError('A callback function must be supplied to calls against `.createTable` ' + 'and `.table`');
  }
}

TableBuilder.prototype.setSchema = function (schemaName) {
  this._schemaName = schemaName;
};

// Convert the current tableBuilder object "toSQL"
// giving us additional methods if we're altering
// rather than creating the table.
TableBuilder.prototype.toSQL = function () {
  if (this._method === 'alter') {
    _lodash.extend(this, AlterMethods);
  }
  this._fn.call(this, this);
  return this.client.tableCompiler(this).toSQL();
};

_lodash.each([

// Each of the index methods can be called individually, with the
// column name to be used, e.g. table.unique('column').
'index', 'primary', 'unique',

// Key specific
'dropPrimary', 'dropUnique', 'dropIndex', 'dropForeign'], function (method) {
  TableBuilder.prototype[method] = function () {
    this._statements.push({
      grouping: 'alterTable',
      method: method,
      args: _lodash.toArray(arguments)
    });
    return this;
  };
});

// Warn for dialect-specific table methods, since that's the
// only time these are supported.
var specialMethods = {
  mysql: ['engine', 'charset', 'collate'],
  postgresql: ['inherits']
};
_lodash.each(specialMethods, function (methods, dialect) {
  _lodash.each(methods, function (method) {
    TableBuilder.prototype[method] = function (value) {
      if (this.client.dialect !== dialect) {
        helpers.warn('Knex only supports ' + method + ' statement with ' + dialect + '.');
      }
      if (this._method === 'alter') {
        helpers.warn('Knex does not support altering the ' + method + ' outside of create ' + 'table, please use knex.raw statement.');
      }
      this._single[method] = value;
    };
  });
});

// Each of the column types that we can add, we create a new ColumnBuilder
// instance and push it onto the statements array.
var columnTypes = [

// Numeric
'tinyint', 'smallint', 'mediumint', 'int', 'bigint', 'decimal', 'float', 'double', 'real', 'bit', 'boolean', 'serial',

// Date / Time
'date', 'datetime', 'timestamp', 'time', 'year',

// String
'char', 'varchar', 'tinytext', 'tinyText', 'text', 'mediumtext', 'mediumText', 'longtext', 'longText', 'binary', 'varbinary', 'tinyblob', 'tinyBlob', 'mediumblob', 'mediumBlob', 'blob', 'longblob', 'longBlob', 'enum', 'set',

// Increments, Aliases, and Additional
'bool', 'dateTime', 'increments', 'bigincrements', 'bigIncrements', 'integer', 'biginteger', 'bigInteger', 'string', 'timestamps', 'json', 'jsonb', 'uuid', 'enu', 'specificType'];

// For each of the column methods, create a new "ColumnBuilder" interface,
// push it onto the "allStatements" stack, and then return the interface,
// with which we can add indexes, etc.
_lodash.each(columnTypes, function (type) {
  TableBuilder.prototype[type] = function () {
    var args = _lodash.toArray(arguments);

    // The "timestamps" call is really a compound call to set the
    // `created_at` and `updated_at` columns.
    if (type === 'timestamps') {
      var col = args[0] === true ? 'timestamp' : 'datetime';
      var createdAt = this[col]('created_at');
      var updatedAt = this[col]('updated_at');
      if (args[1] === true) {
        var now = this.client.raw('CURRENT_TIMESTAMP');
        createdAt.notNullable().defaultTo(now);
        updatedAt.notNullable().defaultTo(now);
      }
      return;
    }
    var builder = this.client.columnBuilder(this, type, args);

    this._statements.push({
      grouping: 'columns',
      builder: builder
    });
    return builder;
  };
});

// Set the comment value for a table, they're only allowed to be called
// once per table.
TableBuilder.prototype.comment = function (value) {
  this._single.comment = value;
};

// Set a foreign key on the table, calling
// `table.foreign('column_name', 'foreignKeyName').references('column').on('table').onDelete()...
// Also called from the ColumnBuilder context when chaining.
TableBuilder.prototype.foreign = function (column, foreignKeyName) {
  var foreignData = { column: column, foreignKeyName: foreignKeyName };
  this._statements.push({
    grouping: 'alterTable',
    method: 'foreign',
    args: [foreignData]
  });
  var returnObj = {
    references: function references(tableColumn) {
      var pieces = undefined;
      if (_lodash.isString(tableColumn)) {
        pieces = tableColumn.split('.');
      }
      if (!pieces || pieces.length === 1) {
        foreignData.references = pieces ? pieces[0] : tableColumn;
        return {
          on: function on(tableName) {
            if (typeof tableName !== 'string') {
              throw new TypeError('Expected tableName to be a string, got: ' + typeof tableName);
            }
            foreignData.inTable = tableName;
            return returnObj;
          },
          inTable: function inTable() {
            return this.on.apply(this, arguments);
          }
        };
      }
      foreignData.inTable = pieces[0];
      foreignData.references = pieces[1];
      return returnObj;
    },
    onUpdate: function onUpdate(statement) {
      foreignData.onUpdate = statement;
      return returnObj;
    },
    onDelete: function onDelete(statement) {
      foreignData.onDelete = statement;
      return returnObj;
    },
    _columnBuilder: function _columnBuilder(builder) {
      _lodash.extend(builder, returnObj);
      returnObj = builder;
      return builder;
    }
  };
  return returnObj;
};

var AlterMethods = {

  // Renames the current column `from` the current
  // TODO: this.column(from).rename(to)
  renameColumn: function renameColumn(from, to) {
    this._statements.push({
      grouping: 'alterTable',
      method: 'renameColumn',
      args: [from, to]
    });
    return this;
  },

  dropTimestamps: function dropTimestamps() {
    return this.dropColumns(['created_at', 'updated_at']);
  },

  setNullable: function setNullable(column) {
    this._statements.push({
      grouping: 'alterTable',
      method: 'setNullable',
      args: [column]
    });

    return this;
  },

  dropNullable: function dropNullable(column) {
    this._statements.push({
      grouping: 'alterTable',
      method: 'dropNullable',
      args: [column]
    });

    return this;
  }

  // TODO: changeType
};

// Drop a column from the current table.
// TODO: Enable this.column(columnName).drop();
AlterMethods.dropColumn = AlterMethods.dropColumns = function () {
  this._statements.push({
    grouping: 'alterTable',
    method: 'dropColumn',
    args: _lodash.toArray(arguments)
  });
  return this;
};

exports['default'] = TableBuilder;
module.exports = exports['default'];
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9zY2hlbWEvdGFibGVidWlsZGVyLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7OztzQkFTNEQsUUFBUTs7dUJBQzNDLFlBQVk7O0lBQXpCLE9BQU87O0FBRW5CLFNBQVMsWUFBWSxDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLEVBQUUsRUFBRTtBQUNuRCxNQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQTtBQUNwQixNQUFJLENBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQztBQUNkLE1BQUksQ0FBQyxPQUFPLEdBQUcsTUFBTSxDQUFDO0FBQ3RCLE1BQUksQ0FBQyxXQUFXLEdBQUcsU0FBUyxDQUFDO0FBQzdCLE1BQUksQ0FBQyxVQUFVLEdBQUcsU0FBUyxDQUFDO0FBQzVCLE1BQUksQ0FBQyxXQUFXLEdBQUcsRUFBRSxDQUFDO0FBQ3RCLE1BQUksQ0FBQyxPQUFPLEdBQUcsRUFBRSxDQUFDOztBQUVsQixNQUFHLENBQUMsbUJBQVcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFO0FBQ3hCLFVBQU0sSUFBSSxTQUFTLENBQ2pCLHVFQUF1RSxHQUN2RSxjQUFjLENBQ2YsQ0FBQztHQUNIO0NBQ0Y7O0FBRUQsWUFBWSxDQUFDLFNBQVMsQ0FBQyxTQUFTLEdBQUcsVUFBUyxVQUFVLEVBQUU7QUFDdEQsTUFBSSxDQUFDLFdBQVcsR0FBRyxVQUFVLENBQUM7Q0FDL0IsQ0FBQzs7Ozs7QUFLRixZQUFZLENBQUMsU0FBUyxDQUFDLEtBQUssR0FBRyxZQUFXO0FBQ3hDLE1BQUksSUFBSSxDQUFDLE9BQU8sS0FBSyxPQUFPLEVBQUU7QUFDNUIsbUJBQU8sSUFBSSxFQUFFLFlBQVksQ0FBQyxDQUFDO0dBQzVCO0FBQ0QsTUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO0FBQzFCLFNBQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLENB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V0FBVyxHQUFHLFlBQVc7QUFDcEMsTUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUM7QUFDcEIsWUFBUSxFQUFFLFlBQVk7QUFDdEIsVUFBTSxFQUFFLFlBQVk7QUFDcEIsUUFBSSxFQUFFLGdCQUFRLFNBQVMsQ0FBQztHQUN6QixDQUFDLENBQUM7QUFDSCxTQUFPLElBQUksQ0FBQztDQUNiLENBQUM7O3FCQUdhLFlBQVkiLCJmaWxlIjoidGFibGVidWlsZGVyLmpzIiwic291cmNlc0NvbnRlbnQiOlsiXG4vLyBUYWJsZUJ1aWxkZXJcblxuLy8gVGFrZXMgdGhlIGZ1bmN0aW9uIHBhc3NlZCB0byB0aGUgXCJjcmVhdGVUYWJsZVwiIG9yIFwidGFibGUvZWRpdFRhYmxlXCJcbi8vIGZ1bmN0aW9ucyBhbmQgY2FsbHMgaXQgd2l0aCB0aGUgXCJUYWJsZUJ1aWxkZXJcIiBhcyBib3RoIHRoZSBjb250ZXh0IGFuZFxuLy8gdGhlIGZpcnN0IGFyZ3VtZW50LiBJbnNpZGUgdGhpcyBmdW5jdGlvbiB3ZSBjYW4gc3BlY2lmeSB3aGF0IGhhcHBlbnMgdG8gdGhlXG4vLyBtZXRob2QsIHB1c2hpbmcgZXZlcnl0aGluZyB3ZSB3YW50IHRvIGRvIG9udG8gdGhlIFwiYWxsU3RhdGVtZW50c1wiIGFycmF5LFxuLy8gd2hpY2ggaXMgdGhlbiBjb21waWxlZCBpbnRvIHNxbC5cbi8vIC0tLS0tLVxuaW1wb3J0IHsgZXh0ZW5kLCBlYWNoLCB0b0FycmF5LCBpc1N0cmluZywgaXNGdW5jdGlvbiB9IGZyb20gJ2xvZGFzaCdcbmltcG9ydCAqIGFzIGhlbHBlcnMgZnJvbSAnLi4vaGVscGVycyc7XG5cbmZ1bmN0aW9uIFRhYmxlQnVpbGRlcihjbGllbnQsIG1ldGhvZCwgdGFibGVOYW1lLCBmbikge1xuICB0aGlzLmNsaWVudCA9IGNsaWVudFxuICB0aGlzLl9mbiA9IGZuO1xuICB0aGlzLl9tZXRob2QgPSBtZXRob2Q7XG4gIHRoaXMuX3NjaGVtYU5hbWUgPSB1bmRlZmluZWQ7XG4gIHRoaXMuX3RhYmxlTmFtZSA9IHRhYmxlTmFtZTtcbiAgdGhpcy5fc3RhdGVtZW50cyA9IFtdO1xuICB0aGlzLl9zaW5nbGUgPSB7fTtcblxuICBpZighaXNGdW5jdGlvbih0aGlzLl9mbikpIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFxuICAgICAgJ0EgY2FsbGJhY2sgZnVuY3Rpb24gbXVzdCBiZSBzdXBwbGllZCB0byBjYWxscyBhZ2FpbnN0IGAuY3JlYXRlVGFibGVgICcgK1xuICAgICAgJ2FuZCBgLnRhYmxlYCdcbiAgICApO1xuICB9XG59XG5cblRhYmxlQnVpbGRlci5wcm90b3R5cGUuc2V0U2NoZW1hID0gZnVuY3Rpb24oc2NoZW1hTmFtZSkge1xuICB0aGlzLl9zY2hlbWFOYW1lID0gc2NoZW1hTmFtZTtcbn07XG5cbi8vIENvbnZlcnQgdGhlIGN1cnJlbnQgdGFibGVCdWlsZGVyIG9iamVjdCBcInRvU1FMXCJcbi8vIGdpdmluZyB1cyBhZGRpdGlvbmFsIG1ldGhvZHMgaWYgd2UncmUgYWx0ZXJpbmdcbi8vIHJhdGhlciB0aGFuIGNyZWF0aW5nIHRoZSB0YWJsZS5cblRhYmxlQnVpbGRlci5wcm90b3R5cGUudG9TUUwgPSBmdW5jdGlvbigpIHtcbiAgaWYgKHRoaXMuX21ldGhvZCA9PT0gJ2FsdGVyJykge1xuICAgIGV4dGVuZCh0aGlzLCBBbHRlck1ldGhvZHMpO1xuICB9XG4gIHRoaXMuX2ZuLmNhbGwodGhpcywgdGhpcyk7XG4gIHJldHVybiB0aGlzLmNsaWVudC50YWJsZUNvbXBpbGVyKHRoaXMpLnRvU1FMKCk7XG59O1xuXG5lYWNoKFtcblxuICAvLyBFYWNoIG9mIHRoZSBpbmRleCBtZXRob2RzIGNhbiBiZSBjYWxsZWQgaW5kaXZpZHVhbGx5LCB3aXRoIHRoZVxuICAvLyBjb2x1bW4gbmFtZSB0byBiZSB1c2VkLCBlLmcuIHRhYmxlLnVuaXF1ZSgnY29sdW1uJykuXG4gICdpbmRleCcsICdwcmltYXJ5JywgJ3VuaXF1ZScsXG5cbiAgLy8gS2V5IHNwZWNpZmljXG4gICdkcm9wUHJpbWFyeScsICdkcm9wVW5pcXVlJywgJ2Ryb3BJbmRleCcsICdkcm9wRm9yZWlnbidcblxuXSwgZnVuY3Rpb24obWV0aG9kKSB7XG4gIFRhYmxlQnVpbGRlci5wcm90b3R5cGVbbWV0aG9kXSA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuX3N0YXRlbWVudHMucHVzaCh7XG4gICAgICBncm91cGluZzogJ2FsdGVyVGFibGUnLFxuICAgICAgbWV0aG9kLFxuICAgICAgYXJnczogdG9BcnJheShhcmd1bWVudHMpXG4gICAgfSk7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH07XG59KTtcblxuLy8gV2FybiBmb3IgZGlhbGVjdC1zcGVjaWZpYyB0YWJsZSBtZXRob2RzLCBzaW5jZSB0aGF0J3MgdGhlXG4vLyBvbmx5IHRpbWUgdGhlc2UgYXJlIHN1cHBvcnRlZC5cbmNvbnN0IHNwZWNpYWxNZXRob2RzID0ge1xuICBteXNxbDogWydlbmdpbmUnLCAnY2hhcnNldCcsICdjb2xsYXRlJ10sXG4gIHBvc3RncmVzcWw6IFsnaW5oZXJpdHMnXVxufTtcbmVhY2goc3BlY2lhbE1ldGhvZHMsIGZ1bmN0aW9uKG1ldGhvZHMsIGRpYWxlY3QpIHtcbiAgZWFjaChtZXRob2RzLCBmdW5jdGlvbihtZXRob2QpIHtcbiAgICBUYWJsZUJ1aWxkZXIucHJvdG90eXBlW21ldGhvZF0gPSBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgaWYgKHRoaXMuY2xpZW50LmRpYWxlY3QgIT09IGRpYWxlY3QpIHtcbiAgICAgICAgaGVscGVycy53YXJuKGBLbmV4IG9ubHkgc3VwcG9ydHMgJHttZXRob2R9IHN0YXRlbWVudCB3aXRoICR7ZGlhbGVjdH0uYCk7XG4gICAgICB9XG4gICAgICBpZiAodGhpcy5fbWV0aG9kID09PSAnYWx0ZXInKSB7XG4gICAgICAgIGhlbHBlcnMud2FybihcbiAgICAgICAgICBgS25leCBkb2VzIG5vdCBzdXBwb3J0IGFsdGVyaW5nIHRoZSAke21ldGhvZH0gb3V0c2lkZSBvZiBjcmVhdGUgYCArXG4gICAgICAgICAgYHRhYmxlLCBwbGVhc2UgdXNlIGtuZXgucmF3IHN0YXRlbWVudC5gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICB0aGlzLl9zaW5nbGVbbWV0aG9kXSA9IHZhbHVlO1xuICAgIH07XG4gIH0pO1xufSk7XG5cbi8vIEVhY2ggb2YgdGhlIGNvbHVtbiB0eXBlcyB0aGF0IHdlIGNhbiBhZGQsIHdlIGNyZWF0ZSBhIG5ldyBDb2x1bW5CdWlsZGVyXG4vLyBpbnN0YW5jZSBhbmQgcHVzaCBpdCBvbnRvIHRoZSBzdGF0ZW1lbnRzIGFycmF5LlxuY29uc3QgY29sdW1uVHlwZXMgPSBbXG5cbiAgLy8gTnVtZXJpY1xuICAndGlueWludCcsXG4gICdzbWFsbGludCcsXG4gICdtZWRpdW1pbnQnLFxuICAnaW50JyxcbiAgJ2JpZ2ludCcsXG4gICdkZWNpbWFsJyxcbiAgJ2Zsb2F0JyxcbiAgJ2RvdWJsZScsXG4gICdyZWFsJyxcbiAgJ2JpdCcsXG4gICdib29sZWFuJyxcbiAgJ3NlcmlhbCcsXG5cbiAgLy8gRGF0ZSAvIFRpbWVcbiAgJ2RhdGUnLFxuICAnZGF0ZXRpbWUnLFxuICAndGltZXN0YW1wJyxcbiAgJ3RpbWUnLFxuICAneWVhcicsXG5cbiAgLy8gU3RyaW5nXG4gICdjaGFyJyxcbiAgJ3ZhcmNoYXInLFxuICAndGlueXRleHQnLFxuICAndGlueVRleHQnLFxuICAndGV4dCcsXG4gICdtZWRpdW10ZXh0JyxcbiAgJ21lZGl1bVRleHQnLFxuICAnbG9uZ3RleHQnLFxuICAnbG9uZ1RleHQnLFxuICAnYmluYXJ5JyxcbiAgJ3ZhcmJpbmFyeScsXG4gICd0aW55YmxvYicsXG4gICd0aW55QmxvYicsXG4gICdtZWRpdW1ibG9iJyxcbiAgJ21lZGl1bUJsb2InLFxuICAnYmxvYicsXG4gICdsb25nYmxvYicsXG4gICdsb25nQmxvYicsXG4gICdlbnVtJyxcbiAgJ3NldCcsXG5cbiAgLy8gSW5jcmVtZW50cywgQWxpYXNlcywgYW5kIEFkZGl0aW9uYWxcbiAgJ2Jvb2wnLFxuICAnZGF0ZVRpbWUnLFxuICAnaW5jcmVtZW50cycsXG4gICdiaWdpbmNyZW1lbnRzJyxcbiAgJ2JpZ0luY3JlbWVudHMnLFxuICAnaW50ZWdlcicsXG4gICdiaWdpbnRlZ2VyJyxcbiAgJ2JpZ0ludGVnZXInLFxuICAnc3RyaW5nJyxcbiAgJ3RpbWVzdGFtcHMnLFxuICAnanNvbicsXG4gICdqc29uYicsXG4gICd1dWlkJyxcbiAgJ2VudScsXG4gICdzcGVjaWZpY1R5cGUnXG5dO1xuXG4vLyBGb3IgZWFjaCBvZiB0aGUgY29sdW1uIG1ldGhvZHMsIGNyZWF0ZSBhIG5ldyBcIkNvbHVtbkJ1aWxkZXJcIiBpbnRlcmZhY2UsXG4vLyBwdXNoIGl0IG9udG8gdGhlIFwiYWxsU3RhdGVtZW50c1wiIHN0YWNrLCBhbmQgdGhlbiByZXR1cm4gdGhlIGludGVyZmFjZSxcbi8vIHdpdGggd2hpY2ggd2UgY2FuIGFkZCBpbmRleGVzLCBldGMuXG5lYWNoKGNvbHVtblR5cGVzLCBmdW5jdGlvbih0eXBlKSB7XG4gIFRhYmxlQnVpbGRlci5wcm90b3R5cGVbdHlwZV0gPSBmdW5jdGlvbigpIHtcbiAgICBjb25zdCBhcmdzID0gdG9BcnJheShhcmd1bWVudHMpO1xuXG4gICAgLy8gVGhlIFwidGltZXN0YW1wc1wiIGNhbGwgaXMgcmVhbGx5IGEgY29tcG91bmQgY2FsbCB0byBzZXQgdGhlXG4gICAgLy8gYGNyZWF0ZWRfYXRgIGFuZCBgdXBkYXRlZF9hdGAgY29sdW1ucy5cbiAgICBpZiAodHlwZSA9PT0gJ3RpbWVzdGFtcHMnKSB7XG4gICAgICBjb25zdCBjb2wgPSAoYXJnc1swXSA9PT0gdHJ1ZSkgPyAndGltZXN0YW1wJyA6ICdkYXRldGltZSc7XG4gICAgICBjb25zdCBjcmVhdGVkQXQgPSB0aGlzW2NvbF0oJ2NyZWF0ZWRfYXQnKTtcbiAgICAgIGNvbnN0IHVwZGF0ZWRBdCA9IHRoaXNbY29sXSgndXBkYXRlZF9hdCcpO1xuICAgICAgaWYgKGFyZ3NbMV0gPT09IHRydWUpIHtcbiAgICAgICAgY29uc3Qgbm93ID0gdGhpcy5jbGllbnQucmF3KCdDVVJSRU5UX1RJTUVTVEFNUCcpO1xuICAgICAgICBjcmVhdGVkQXQubm90TnVsbGFibGUoKS5kZWZhdWx0VG8obm93KTtcbiAgICAgICAgdXBkYXRlZEF0Lm5vdE51bGxhYmxlKCkuZGVmYXVsdFRvKG5vdyk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGJ1aWxkZXIgPSB0aGlzLmNsaWVudC5jb2x1bW5CdWlsZGVyKHRoaXMsIHR5cGUsIGFyZ3MpO1xuXG4gICAgdGhpcy5fc3RhdGVtZW50cy5wdXNoKHtcbiAgICAgIGdyb3VwaW5nOiAnY29sdW1ucycsXG4gICAgICBidWlsZGVyXG4gICAgfSk7XG4gICAgcmV0dXJuIGJ1aWxkZXI7XG4gIH07XG5cbn0pO1xuXG4vLyBTZXQgdGhlIGNvbW1lbnQgdmFsdWUgZm9yIGEgdGFibGUsIHRoZXkncmUgb25seSBhbGxvd2VkIHRvIGJlIGNhbGxlZFxuLy8gb25jZSBwZXIgdGFibGUuXG5UYWJsZUJ1aWxkZXIucHJvdG90eXBlLmNvbW1lbnQgPSBmdW5jdGlvbih2YWx1ZSkge1xuICB0aGlzLl9zaW5nbGUuY29tbWVudCA9IHZhbHVlO1xufTtcblxuLy8gU2V0IGEgZm9yZWlnbiBrZXkgb24gdGhlIHRhYmxlLCBjYWxsaW5nXG4vLyBgdGFibGUuZm9yZWlnbignY29sdW1uX25hbWUnLCAnZm9yZWlnbktleU5hbWUnKS5yZWZlcmVuY2VzKCdjb2x1bW4nKS5vbigndGFibGUnKS5vbkRlbGV0ZSgpLi4uXG4vLyBBbHNvIGNhbGxlZCBmcm9tIHRoZSBDb2x1bW5CdWlsZGVyIGNvbnRleHQgd2hlbiBjaGFpbmluZy5cblRhYmxlQnVpbGRlci5wcm90b3R5cGUuZm9yZWlnbiA9IGZ1bmN0aW9uKGNvbHVtbiwgZm9yZWlnbktleU5hbWUpIHtcbiAgY29uc3QgZm9yZWlnbkRhdGEgPSB7Y29sdW1uOiBjb2x1bW4sIGZvcmVpZ25LZXlOYW1lOiBmb3JlaWduS2V5TmFtZX07XG4gIHRoaXMuX3N0YXRlbWVudHMucHVzaCh7XG4gICAgZ3JvdXBpbmc6ICdhbHRlclRhYmxlJyxcbiAgICBtZXRob2Q6ICdmb3JlaWduJyxcbiAgICBhcmdzOiBbZm9yZWlnbkRhdGFdXG4gIH0pO1xuICBsZXQgcmV0dXJuT2JqID0ge1xuICAgIHJlZmVyZW5jZXModGFibGVDb2x1bW4pIHtcbiAgICAgIGxldCBwaWVjZXM7XG4gICAgICBpZiAoaXNTdHJpbmcodGFibGVDb2x1bW4pKSB7XG4gICAgICAgIHBpZWNlcyA9IHRhYmxlQ29sdW1uLnNwbGl0KCcuJyk7XG4gICAgICB9XG4gICAgICBpZiAoIXBpZWNlcyB8fCBwaWVjZXMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgIGZvcmVpZ25EYXRhLnJlZmVyZW5jZXMgPSBwaWVjZXMgPyBwaWVjZXNbMF0gOiB0YWJsZUNvbHVtbjtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBvbih0YWJsZU5hbWUpIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdGFibGVOYW1lICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKGBFeHBlY3RlZCB0YWJsZU5hbWUgdG8gYmUgYSBzdHJpbmcsIGdvdDogJHt0eXBlb2YgdGFibGVOYW1lfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZm9yZWlnbkRhdGEuaW5UYWJsZSA9IHRhYmxlTmFtZTtcbiAgICAgICAgICAgIHJldHVybiByZXR1cm5PYmo7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBpblRhYmxlKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMub24uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBmb3JlaWduRGF0YS5pblRhYmxlID0gcGllY2VzWzBdO1xuICAgICAgZm9yZWlnbkRhdGEucmVmZXJlbmNlcyA9IHBpZWNlc1sxXTtcbiAgICAgIHJldHVybiByZXR1cm5PYmo7XG4gICAgfSxcbiAgICBvblVwZGF0ZShzdGF0ZW1lbnQpIHtcbiAgICAgIGZvcmVpZ25EYXRhLm9uVXBkYXRlID0gc3RhdGVtZW50O1xuICAgICAgcmV0dXJuIHJldHVybk9iajtcbiAgICB9LFxuICAgIG9uRGVsZXRlKHN0YXRlbWVudCkge1xuICAgICAgZm9yZWlnbkRhdGEub25EZWxldGUgPSBzdGF0ZW1lbnQ7XG4gICAgICByZXR1cm4gcmV0dXJuT2JqO1xuICAgIH0sXG4gICAgX2NvbHVtbkJ1aWxkZXIoYnVpbGRlcikge1xuICAgICAgZXh0ZW5kKGJ1aWxkZXIsIHJldHVybk9iaik7XG4gICAgICByZXR1cm5PYmogPSBidWlsZGVyO1xuICAgICAgcmV0dXJuIGJ1aWxkZXI7XG4gICAgfVxuICB9O1xuICByZXR1cm4gcmV0dXJuT2JqO1xufVxuXG5jb25zdCBBbHRlck1ldGhvZHMgPSB7XG5cbiAgLy8gUmVuYW1lcyB0aGUgY3VycmVudCBjb2x1bW4gYGZyb21gIHRoZSBjdXJyZW50XG4gIC8vIFRPRE86IHRoaXMuY29sdW1uKGZyb20pLnJlbmFtZSh0bylcbiAgcmVuYW1lQ29sdW1uKGZyb20sIHRvKSB7XG4gICAgdGhpcy5fc3RhdGVtZW50cy5wdXNoKHtcbiAgICAgIGdyb3VwaW5nOiAnYWx0ZXJUYWJsZScsXG4gICAgICBtZXRob2Q6ICdyZW5hbWVDb2x1bW4nLFxuICAgICAgYXJnczogW2Zyb20sIHRvXVxuICAgIH0pO1xuICAgIHJldHVybiB0aGlzO1xuICB9LFxuXG4gIGRyb3BUaW1lc3RhbXBzKCkge1xuICAgIHJldHVybiB0aGlzLmRyb3BDb2x1bW5zKFsnY3JlYXRlZF9hdCcsICd1cGRhdGVkX2F0J10pO1xuICB9LFxuXG4gIHNldE51bGxhYmxlOiBmdW5jdGlvbihjb2x1bW4pIHtcbiAgICB0aGlzLl9zdGF0ZW1lbnRzLnB1c2goe1xuICAgICAgZ3JvdXBpbmc6ICdhbHRlclRhYmxlJyxcbiAgICAgIG1ldGhvZDogJ3NldE51bGxhYmxlJyxcbiAgICAgIGFyZ3M6IFtjb2x1bW5dXG4gICAgfSk7XG5cbiAgICByZXR1cm4gdGhpcztcbiAgfSxcblxuICBkcm9wTnVsbGFibGU6IGZ1bmN0aW9uKGNvbHVtbikge1xuICAgIHRoaXMuX3N0YXRlbWVudHMucHVzaCh7XG4gICAgICBncm91cGluZzogJ2FsdGVyVGFibGUnLFxuICAgICAgbWV0aG9kOiAnZHJvcE51bGxhYmxlJyxcbiAgICAgIGFyZ3M6IFtjb2x1bW5dXG4gICAgfSk7XG5cbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8vIFRPRE86IGNoYW5nZVR5cGVcbn07XG5cbi8vIERyb3AgYSBjb2x1bW4gZnJvbSB0aGUgY3VycmVudCB0YWJsZS5cbi8vIFRPRE86IEVuYWJsZSB0aGlzLmNvbHVtbihjb2x1bW5OYW1lKS5kcm9wKCk7XG5BbHRlck1ldGhvZHMuZHJvcENvbHVtbiA9XG5BbHRlck1ldGhvZHMuZHJvcENvbHVtbnMgPSBmdW5jdGlvbigpIHtcbiAgdGhpcy5fc3RhdGVtZW50cy5wdXNoKHtcbiAgICBncm91cGluZzogJ2FsdGVyVGFibGUnLFxuICAgIG1ldGhvZDogJ2Ryb3BDb2x1bW4nLFxuICAgIGFyZ3M6IHRvQXJyYXkoYXJndW1lbnRzKVxuICB9KTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5cbmV4cG9ydCBkZWZhdWx0IFRhYmxlQnVpbGRlcjtcbiJdfQ==