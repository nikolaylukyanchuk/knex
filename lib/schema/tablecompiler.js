/* eslint max-len:0 */

// Table Compiler
// -------
'use strict';

exports.__esModule = true;

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj['default'] = obj; return newObj; } }

var _helpers = require('./helpers');

var _helpers2 = require('../helpers');

var helpers = _interopRequireWildcard(_helpers2);

var _lodash = require('lodash');

function TableCompiler(client, tableBuilder) {
  this.client = client;
  this.method = tableBuilder._method;
  this.schemaNameRaw = tableBuilder._schemaName;
  this.tableNameRaw = tableBuilder._tableName;
  this.single = tableBuilder._single;
  this.grouped = _lodash.groupBy(tableBuilder._statements, 'grouping');
  this.formatter = client.formatter();
  this.sequence = [];
  this._formatting = client.config && client.config.formatting;
}
TableCompiler.prototype.alterColumnPrefix = 'modify column';

TableCompiler.prototype.pushQuery = _helpers.pushQuery;

TableCompiler.prototype.pushAdditional = _helpers.pushAdditional;

// Convert the tableCompiler toSQL
TableCompiler.prototype.toSQL = function () {
  this[this.method]();
  return this.sequence;
};

TableCompiler.prototype.lowerCase = true;

// Column Compilation
// -------

// If this is a table "creation", we need to first run through all
// of the columns to build them into a single string,
// and then run through anything else and push it to the query sequence.
TableCompiler.prototype.createAlterTableMethods = null;
TableCompiler.prototype.create = function (ifNot) {
  var columns = this.getColumns();
  var columnTypes = this.getColumnTypes(columns);
  if (this.createAlterTableMethods) {
    this.alterTableForCreate(columnTypes);
  }
  this.createQuery(columnTypes, ifNot);
  this.columnQueries(columns);
  delete this.single.comment;
  this.alterTable();
};

// Only create the table if it doesn't exist.
TableCompiler.prototype.createIfNot = function () {
  this.create(true);
};

// If we're altering the table, we need to one-by-one
// go through and handle each of the queries associated
// with altering the table's schema.
TableCompiler.prototype.alter = function () {
  var columns = this.getColumns();
  var columnTypes = this.getColumnTypes(columns);
  this.addColumns(columnTypes);
  this.columnQueries(columns);
  this.alterTable();
};

TableCompiler.prototype.foreign = function (foreignData) {
  if (foreignData.inTable && foreignData.references) {
    var keyName = foreignData.foreignKeyName ? foreignData.foreignKeyName : this._indexCommand('foreign', this.tableNameRaw, foreignData.column);
    var column = this.formatter.columnize(foreignData.column);
    var references = this.formatter.columnize(foreignData.references);
    var inTable = this.formatter.wrap(foreignData.inTable);
    var onUpdate = foreignData.onUpdate ? (this.lowerCase ? ' on update ' : ' ON UPDATE ') + foreignData.onUpdate : '';
    var onDelete = foreignData.onDelete ? (this.lowerCase ? ' on delete ' : ' ON DELETE ') + foreignData.onDelete : '';
    if (this.lowerCase) {
      this.pushQuery((!this.forCreate ? 'alter table ' + this.tableName() + ' add ' : '') + 'constraint ' + keyName + ' ' + 'foreign key (' + column + ') references ' + inTable + ' (' + references + ')' + onUpdate + onDelete);
    } else {
      this.pushQuery((!this.forCreate ? 'ALTER TABLE ' + this.tableName() + ' ADD ' : '') + 'CONSTRAINT ' + keyName + ' ' + 'FOREIGN KEY (' + column + ') REFERENCES ' + inTable + ' (' + references + ')' + onUpdate + onDelete);
    }
  }
};

// Get all of the column sql & bindings individually for building the table queries.
TableCompiler.prototype.getColumnTypes = function (columns) {
  return _lodash.reduce(_lodash.map(columns, _lodash.first), function (memo, column) {
    memo.sql.push(column.sql);
    memo.bindings.concat(column.bindings);
    return memo;
  }, { sql: [], bindings: [] });
};

// Adds all of the additional queries from the "column"
TableCompiler.prototype.columnQueries = function (columns) {
  var queries = _lodash.reduce(_lodash.map(columns, _lodash.tail), function (memo, column) {
    if (!_lodash.isEmpty(column)) return memo.concat(column);
    return memo;
  }, []);
  for (var i = 0, l = queries.length; i < l; i++) {
    this.pushQuery(queries[i]);
  }
};

// Add a new column.
TableCompiler.prototype.addColumnsPrefix = 'add column ';

// All of the columns to "add" for the query
TableCompiler.prototype.addColumns = function (columns) {
  var _this = this;

  if (columns.sql.length > 0) {
    var columnSql = _lodash.map(columns.sql, function (column) {
      return _this.addColumnsPrefix + column;
    });
    this.pushQuery({
      sql: (this.lowerCase ? 'alter table ' : 'ALTER TABLE ') + this.tableName() + ' ' + columnSql.join(', '),
      bindings: columns.bindings
    });
  }
};

// Compile the columns as needed for the current create or alter table
TableCompiler.prototype.getColumns = function () {
  var _this2 = this;

  var columns = this.grouped.columns || [];
  return columns.map(function (column) {
    return _this2.client.columnCompiler(_this2, column.builder).toSQL();
  });
};

TableCompiler.prototype.tableName = function () {
  var name = this.schemaNameRaw ? this.schemaNameRaw + '.' + this.tableNameRaw : this.tableNameRaw;

  return this.formatter.wrap(name);
};

// Generate all of the alter column statements necessary for the query.
TableCompiler.prototype.alterTable = function () {
  var alterTable = this.grouped.alterTable || [];
  for (var i = 0, l = alterTable.length; i < l; i++) {
    var statement = alterTable[i];
    if (this[statement.method]) {
      this[statement.method].apply(this, statement.args);
    } else {
      helpers.error('Debug: ' + statement.method + ' does not exist');
    }
  }
  for (var item in this.single) {
    if (typeof this[item] === 'function') this[item](this.single[item]);
  }
};

TableCompiler.prototype.alterTableForCreate = function (columnTypes) {
  this.forCreate = true;
  var savedSequence = this.sequence;
  var alterTable = this.grouped.alterTable || [];
  this.grouped.alterTable = [];
  for (var i = 0, l = alterTable.length; i < l; i++) {
    var statement = alterTable[i];
    if (_lodash.indexOf(this.createAlterTableMethods, statement.method) < 0) {
      this.grouped.alterTable.push(statement);
      continue;
    }
    if (this[statement.method]) {
      this.sequence = [];
      this[statement.method].apply(this, statement.args);
      columnTypes.sql.push(this.sequence[0].sql);
    } else {
      helpers.error('Debug: ' + statement.method + ' does not exist');
    }
  }
  this.sequence = savedSequence;
  this.forCreate = false;
};

// Drop the index on the current table.
TableCompiler.prototype.dropIndex = function (value) {
  this.pushQuery('drop index' + value);
};

// Drop the unique
TableCompiler.prototype.dropUnique = TableCompiler.prototype.dropForeign = function () {
  throw new Error('Method implemented in the dialect driver');
};

TableCompiler.prototype.dropColumnPrefix = 'drop column ';
TableCompiler.prototype.dropColumn = function () {
  var _this3 = this;

  var columns = helpers.normalizeArr.apply(null, arguments);
  var drops = _lodash.map(_lodash.isArray(columns) ? columns : [columns], function (column) {
    return _this3.dropColumnPrefix + _this3.formatter.wrap(column);
  });
  this.pushQuery((this.lowerCase ? 'alter table ' : 'ALTER TABLE ') + this.tableName() + ' ' + drops.join(', '));
};

// If no name was specified for this index, we will create one using a basic
// convention of the table name, followed by the columns, followed by an
// index type, such as primary or index, which makes the index unique.
TableCompiler.prototype._indexCommand = function (type, tableName, columns) {
  if (!_lodash.isArray(columns)) columns = columns ? [columns] : [];
  var table = tableName.replace(/\.|-/g, '_');
  var indexName = (table + '_' + columns.join('_') + '_' + type).toLowerCase();
  return this.formatter.wrap(indexName);
};

//Default implementation of setNullable. Overwrite on dialect-specific tablecompiler when needed
//(See postgres/mssql for reference)
TableCompiler.prototype._setNullableState = function (column, nullable) {
  var _this4 = this;

  var tableName = this.tableName();
  var columnName = this.formatter.columnize(column);
  var alterColumnPrefix = this.alterColumnPrefix;
  return this.pushQuery({
    sql: 'SELECT 1',
    output: function output() {
      return _this4.client.queryBuilder().from(_this4.tableNameRaw).columnInfo(column).then(function (columnInfo) {
        if (_lodash.isEmpty(columnInfo)) {
          throw new Error('.setNullable: Column ' + columnName + ' does not exist in table ' + tableName + '.');
        }
        var nullableType = nullable ? 'null' : 'not null';
        var columnType = columnInfo.type + (columnInfo.maxLength ? '(' + columnInfo.maxLength + ')' : '');
        var defaultValue = columnInfo.defaultValue !== null && columnInfo.defaultValue !== void 0 ? 'default \'' + columnInfo.defaultValue + '\'' : '';
        var sql = 'alter table ' + tableName + ' ' + alterColumnPrefix + ' ' + columnName + ' ' + columnType + ' ' + nullableType + ' ' + defaultValue;
        return _this4.client.raw(sql);
      });
    }
  });
};

TableCompiler.prototype.setNullable = function (column) {
  return this._setNullableState(column, true);
};

TableCompiler.prototype.dropNullable = function (column) {
  return this._setNullableState(column, false);
};

exports['default'] = TableCompiler;
module.exports = exports['default'];
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9zY2hlbWEvdGFibGVjb21waWxlci5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7O3VCQUkwQyxXQUFXOzt3QkFDNUIsWUFBWTs7SUFBekIsT0FBTzs7c0JBQzBELFFBQVE7O0FBRXJGLFNBQVMsYUFBYSxDQUFDLE1BQU0sRUFBRSxZQUFZLEVBQUU7QUFDM0MsTUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUE7QUFDcEIsTUFBSSxDQUFDLE1BQU0sR0FBRyxZQUFZLENBQUMsT0FBTyxDQUFDO0FBQ25DLE1BQUksQ0FBQyxhQUFhLEdBQUcsWUFBWSxDQUFDLFdBQVcsQ0FBQztBQUM5QyxNQUFJLENBQUMsWUFBWSxHQUFHLFlBQVksQ0FBQyxVQUFVLENBQUM7QUFDNUMsTUFBSSxDQUFDLE1BQU0sR0FBRyxZQUFZLENBQUMsT0FBTyxDQUFDO0FBQ25DLE1BQUksQ0FBQyxPQUFPLEdBQUcsZ0JBQVEsWUFBWSxDQUFDLFdBQVcsRUFBRSxVQUFVLENBQUMsQ0FBQztBQUM3RCxNQUFJLENBQUMsU0FBUyxHQUFHLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQztBQUNwQyxNQUFJLENBQUMsUUFBUSxHQUFHLEVBQUUsQ0FBQztBQUNuQixNQUFJLENBQUMsV0FBVyxHQUFHLE1BQU0sQ0FBQyxNQUFNLElBQUksTUFBTSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUE7Q0FDN0Q7QUFDRCxhQUFhLENBQUMsU0FBUyxDQUFDLGlCQUFpQixHQUFHLGVBQWUsQ0FBQzs7QUFFNUQsYUFBYSxDQUFDLFNBQVMsQ0FBQyxTQUFTLHFCQUFZLENBQUE7O0FBRTdDLGFBQWEsQ0FBQyxTQUFTLENBQUMsY0FBYywwQkFBaUIsQ0FBQTs7O0FBR3ZELGFBQWEsQ0FBQyxTQUFTLENBQUMsS0FBSyxHQUFHLFlBQVk7QUFDMUMsTUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO0FBQ3BCLFNBQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQztDQUN0QixDQUFDOztBQUVGLGFBQWEsQ0FBQyxTQUFTLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQzs7Ozs7Ozs7QUFRekMsYUFBYSxDQUFDLFNBQVMsQ0FBQyx1QkFBdUIsR0FBRyxJQUFJLENBQUM7QUFDdkQsYUFBYSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEdBQUcsVUFBVSxLQUFLLEVBQUU7QUFDaEQsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO0FBQ2xDLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUM7QUFDakQsTUFBSSxJQUFJLENBQUMsdUJBQXVCLEVBQUU7QUFDaEMsUUFBSSxDQUFDLG1CQUFtQixDQUFDLFdBQVcsQ0FBQyxDQUFDO0dBQ3ZDO0FBQ0QsTUFBSSxDQUFDLFdBQVcsQ0FBQyxXQUFXLEVBQUUsS0FBSyxDQUFDLENBQUM7QUFDckMsTUFBSSxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsQ0FBQztBQUM1QixTQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDO0FBQzNCLE1BQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztDQUNuQixDQUFDOzs7QUFHRixhQUFhLENBQUMsU0FBUyxDQUFDLFdBQVcsR0FBRyxZQUFZO0FBQ2hELE1BQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7Q0FDbkIsQ0FBQzs7Ozs7QUFLRixhQUFhLENBQUMsU0FBUyxDQUFDLEtBQUssR0FBRyxZQUFZO0FBQzFDLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztBQUNsQyxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0FBQ2pELE1BQUksQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLENBQUM7QUFDN0IsTUFBSSxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsQ0FBQztBQUM1QixNQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7Q0FDbkIsQ0FBQzs7QUFFRixhQUFhLENBQUMsU0FBUyxDQUFDLE9BQU8sR0FBRyxVQUFVLFdBQVcsRUFBRTtBQUN2RCxNQUFJLFdBQVcsQ0FBQyxPQUFPLElBQUksV0FBVyxDQUFDLFVBQVUsRUFBRTtBQUNqRCxRQUFNLE9BQU8sR0FBRyxXQUFXLENBQUMsY0FBYyxHQUFHLFdBQVcsQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLFlBQVksRUFBRSxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUM7QUFDL0ksUUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQzVELFFBQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsQ0FBQztBQUNwRSxRQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUM7QUFDekQsUUFBTSxRQUFRLEdBQUcsV0FBVyxDQUFDLFFBQVEsR0FBRyxDQUFDLElBQUksQ0FBQyxTQUFTLEdBQUcsYUFBYSxHQUFHLGFBQWEsQ0FBQSxHQUFJLFdBQVcsQ0FBQyxRQUFRLEdBQUcsRUFBRSxDQUFDO0FBQ3JILFFBQU0sUUFBUSxHQUFHLFdBQVcsQ0FBQyxRQUFRLEdBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxHQUFHLGFBQWEsR0FBRyxhQUFhLENBQUEsR0FBSSxXQUFXLENBQUMsUUFBUSxHQUFHLEVBQUUsQ0FBQztBQUNySCxRQUFJLElBQUksQ0FBQyxTQUFTLEVBQUU7QUFDbEIsVUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsb0JBQWtCLElBQUksQ0FBQyxTQUFTLEVBQUUsYUFBVSxFQUFFLENBQUEsR0FBSSxhQUFhLEdBQUcsT0FBTyxHQUFHLEdBQUcsR0FDNUcsZUFBZSxHQUFHLE1BQU0sR0FBRyxlQUFlLEdBQUcsT0FBTyxHQUFHLElBQUksR0FBRyxVQUFVLEdBQUcsR0FBRyxHQUFHLFFBQVEsR0FBRyxRQUFRLENBQUMsQ0FBQztLQUN6RyxNQUFNO0FBQ0wsVUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsb0JBQWtCLElBQUksQ0FBQyxTQUFTLEVBQUUsYUFBVSxFQUFFLENBQUEsR0FBSSxhQUFhLEdBQUcsT0FBTyxHQUFHLEdBQUcsR0FDNUcsZUFBZSxHQUFHLE1BQU0sR0FBRyxlQUFlLEdBQUcsT0FBTyxHQUFHLElBQUksR0FBRyxVQUFVLEdBQUcsR0FBRyxHQUFHLFFBQVEsR0FBRyxRQUFRLENBQUMsQ0FBQztLQUN6RztHQUNGO0NBQ0YsQ0FBQzs7O0FBR0YsYUFBYSxDQUFDLFNBQVMsQ0FBQyxjQUFjLEdBQUcsVUFBQSxPQUFPO1NBQzlDLGVBQU8sWUFBSSxPQUFPLGdCQUFRLEVBQUUsVUFBVSxJQUFJLEVBQUUsTUFBTSxFQUFFO0FBQ2xELFFBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUMxQixRQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUM7QUFDdEMsV0FBTyxJQUFJLENBQUM7R0FDYixFQUFFLEVBQUUsR0FBRyxFQUFFLEVBQUUsRUFBRSxRQUFRLEVBQUUsRUFBRSxFQUFFLENBQUM7Q0FBQSxDQUM5Qjs7O0FBR0QsYUFBYSxDQUFDLFNBQVMsQ0FBQyxhQUFhLEdBQUcsVUFBVSxPQUFPLEVBQUU7QUFDekQsTUFBTSxPQUFPLEdBQUcsZUFBTyxZQUFJLE9BQU8sZUFBTyxFQUFFLFVBQVUsSUFBSSxFQUFFLE1BQU0sRUFBRTtBQUNqRSxRQUFJLENBQUMsZ0JBQVEsTUFBTSxDQUFDLEVBQUUsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQ2pELFdBQU8sSUFBSSxDQUFDO0dBQ2IsRUFBRSxFQUFFLENBQUMsQ0FBQztBQUNQLE9BQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7QUFDOUMsUUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztHQUM1QjtDQUNGLENBQUM7OztBQUdGLGFBQWEsQ0FBQyxTQUFTLENBQUMsZ0JBQWdCLEdBQUcsYUFBYSxDQUFDOzs7QUFHekQsYUFBYSxDQUFDLFNBQVMsQ0FBQyxVQUFVLEdBQUcsVUFBVSxPQUFPLEVBQUU7OztBQUN0RCxNQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRTtBQUMxQixRQUFNLFNBQVMsR0FBRyxZQUFJLE9BQU8sQ0FBQyxHQUFHLEVBQUUsVUFBQyxNQUFNLEVBQUs7QUFDN0MsYUFBTyxNQUFLLGdCQUFnQixHQUFHLE1BQU0sQ0FBQztLQUN2QyxDQUFDLENBQUM7QUFDSCxRQUFJLENBQUMsU0FBUyxDQUFDO0FBQ2IsU0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFNBQVMsR0FBRyxjQUFjLEdBQUcsY0FBYyxDQUFBLEdBQUksSUFBSSxDQUFDLFNBQVMsRUFBRSxHQUFHLEdBQUcsR0FBRyxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQztBQUN2RyxjQUFRLEVBQUUsT0FBTyxDQUFDLFFBQVE7S0FDM0IsQ0FBQyxDQUFDO0dBQ0o7Q0FDRixDQUFDOzs7QUFHRixhQUFhLENBQUMsU0FBUyxDQUFDLFVBQVUsR0FBRyxZQUFZOzs7QUFDL0MsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLElBQUksRUFBRSxDQUFDO0FBQzNDLFNBQU8sT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFBLE1BQU07V0FDdkIsT0FBSyxNQUFNLENBQUMsY0FBYyxTQUFPLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxLQUFLLEVBQUU7R0FBQSxDQUN6RCxDQUFDO0NBQ0gsQ0FBQzs7QUFFRixhQUFhLENBQUMsU0FBUyxDQUFDLFNBQVMsR0FBRyxZQUFZO0FBQzlDLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxhQUFhLEdBQzFCLElBQUksQ0FBQyxhQUFhLFNBQUksSUFBSSxDQUFDLFlBQVksR0FDeEMsSUFBSSxDQUFDLFlBQVksQ0FBQzs7QUFFdEIsU0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztDQUNsQyxDQUFDOzs7QUFHRixhQUFhLENBQUMsU0FBUyxDQUFDLFVBQVUsR0FBRyxZQUFZO0FBQy9DLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsVUFBVSxJQUFJLEVBQUUsQ0FBQztBQUNqRCxPQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsVUFBVSxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO0FBQ2pELFFBQU0sU0FBUyxHQUFHLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNoQyxRQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLEVBQUU7QUFDMUIsVUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztLQUNwRCxNQUFNO0FBQ0wsYUFBTyxDQUFDLEtBQUssYUFBVyxTQUFTLENBQUMsTUFBTSxxQkFBa0IsQ0FBQztLQUM1RDtHQUNGO0FBQ0QsT0FBSyxJQUFNLElBQUksSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFO0FBQzlCLFFBQUksT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssVUFBVSxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7R0FDckU7Q0FDRixDQUFDOztBQUVGLGFBQWEsQ0FBQyxTQUFTLENBQUMsbUJBQW1CLEdBQUcsVUFBVSxXQUFXLEVBQUU7QUFDbkUsTUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUM7QUFDdEIsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQztBQUNwQyxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFVBQVUsSUFBSSxFQUFFLENBQUM7QUFDakQsTUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFVLEdBQUcsRUFBRSxDQUFDO0FBQzdCLE9BQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxVQUFVLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7QUFDakQsUUFBTSxTQUFTLEdBQUcsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ2hDLFFBQUksZ0JBQVEsSUFBSSxDQUFDLHVCQUF1QixFQUFFLFNBQVMsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUU7QUFDL0QsVUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0FBQ3hDLGVBQVM7S0FDVjtBQUNELFFBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsRUFBRTtBQUMxQixVQUFJLENBQUMsUUFBUSxHQUFHLEVBQUUsQ0FBQztBQUNuQixVQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ25ELGlCQUFXLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0tBQzVDLE1BQU07QUFDTCxhQUFPLENBQUMsS0FBSyxhQUFXLFNBQVMsQ0FBQyxNQUFNLHFCQUFrQixDQUFDO0tBQzVEO0dBQ0Y7QUFDRCxNQUFJLENBQUMsUUFBUSxHQUFHLGFBQWEsQ0FBQztBQUM5QixNQUFJLENBQUMsU0FBUyxHQUFHLEtBQUssQ0FBQztDQUN4QixDQUFDOzs7QUFJRixhQUFhLENBQUMsU0FBUyxDQUFDLFNBQVMsR0FBRyxVQUFVLEtBQUssRUFBRTtBQUNuRCxNQUFJLENBQUMsU0FBUyxnQkFBYyxLQUFLLENBQUcsQ0FBQztDQUN0QyxDQUFDOzs7QUFHRixhQUFhLENBQUMsU0FBUyxDQUFDLFVBQVUsR0FDbEMsYUFBYSxDQUFDLFNBQVMsQ0FBQyxXQUFXLEdBQUcsWUFBWTtBQUNoRCxRQUFNLElBQUksS0FBSyxDQUFDLDBDQUEwQyxDQUFDLENBQUM7Q0FDN0QsQ0FBQzs7QUFFRixhQUFhLENBQUMsU0FBUyxDQUFDLGdCQUFnQixHQUFHLGNBQWMsQ0FBQztBQUMxRCxhQUFhLENBQUMsU0FBUyxDQUFDLFVBQVUsR0FBRyxZQUFZOzs7QUFDL0MsTUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxDQUFDO0FBQzVELE1BQU0sS0FBSyxHQUFHLFlBQUksZ0JBQVEsT0FBTyxDQUFDLEdBQUcsT0FBTyxHQUFHLENBQUMsT0FBTyxDQUFDLEVBQUUsVUFBQyxNQUFNLEVBQUs7QUFDcEUsV0FBTyxPQUFLLGdCQUFnQixHQUFHLE9BQUssU0FBUyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztHQUM1RCxDQUFDLENBQUM7QUFDSCxNQUFJLENBQUMsU0FBUyxDQUNaLENBQUMsSUFBSSxDQUFDLFNBQVMsR0FBRyxjQUFjLEdBQUcsY0FBYyxDQUFBLEdBQ2pELElBQUksQ0FBQyxTQUFTLEVBQUUsR0FBRyxHQUFHLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FDMUMsQ0FBQztDQUNILENBQUM7Ozs7O0FBS0YsYUFBYSxDQUFDLFNBQVMsQ0FBQyxhQUFhLEdBQUcsVUFBVSxJQUFJLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRTtBQUMxRSxNQUFJLENBQUMsZ0JBQVEsT0FBTyxDQUFDLEVBQUUsT0FBTyxHQUFHLE9BQU8sR0FBRyxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQztBQUMxRCxNQUFNLEtBQUssR0FBRyxTQUFTLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxHQUFHLENBQUMsQ0FBQztBQUM5QyxNQUFNLFNBQVMsR0FBRyxDQUFDLEtBQUssR0FBRyxHQUFHLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxHQUFHLEdBQUcsSUFBSSxDQUFBLENBQUUsV0FBVyxFQUFFLENBQUM7QUFDL0UsU0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztDQUN2QyxDQUFDOzs7O0FBS0YsYUFBYSxDQUFDLFNBQVMsQ0FBQyxpQkFBaUIsR0FBRyxVQUFTLE1BQU0sRUFBRSxRQUFRLEVBQUU7OztBQUNyRSxNQUFJLFNBQVMsR0FBRyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7QUFDakMsTUFBSSxVQUFVLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUM7QUFDbEQsTUFBSSxpQkFBaUIsR0FBRyxJQUFJLENBQUMsaUJBQWlCLENBQUM7QUFDL0MsU0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDO0FBQ3BCLE9BQUcsRUFBRSxVQUFVO0FBQ2YsVUFBTSxFQUFFLGtCQUFNO0FBQ1osYUFBTyxPQUFLLE1BQU0sQ0FBQyxZQUFZLEVBQUUsQ0FBQyxJQUFJLENBQUMsT0FBSyxZQUFZLENBQUMsQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLENBQ3ZFLElBQUksQ0FBQyxVQUFDLFVBQVUsRUFBSztBQUNwQixZQUFHLGdCQUFRLFVBQVUsQ0FBQyxFQUFFO0FBQ3RCLGdCQUFNLElBQUksS0FBSywyQkFBeUIsVUFBVSxpQ0FBNEIsU0FBUyxPQUFJLENBQUE7U0FDNUY7QUFDRCxZQUFJLFlBQVksR0FBRyxRQUFRLEdBQUcsTUFBTSxHQUFHLFVBQVUsQ0FBQztBQUNsRCxZQUFJLFVBQVUsR0FBRyxVQUFVLENBQUMsSUFBSSxJQUFJLFVBQVUsQ0FBQyxTQUFTLFNBQU8sVUFBVSxDQUFDLFNBQVMsU0FBTSxFQUFFLENBQUEsQUFBQyxDQUFDO0FBQzdGLFlBQUksWUFBWSxHQUFHLEFBQUMsVUFBVSxDQUFDLFlBQVksS0FBSyxJQUFJLElBQUksVUFBVSxDQUFDLFlBQVksS0FBSyxLQUFLLENBQUMsa0JBQWdCLFVBQVUsQ0FBQyxZQUFZLFVBQU0sRUFBRSxDQUFDO0FBQzFJLFlBQUksR0FBRyxvQkFBa0IsU0FBUyxTQUFJLGlCQUFpQixTQUFJLFVBQVUsU0FBSSxVQUFVLFNBQUksWUFBWSxTQUFJLFlBQVksQUFBRSxDQUFDO0FBQ3RILGVBQU8sT0FBSyxNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO09BQzdCLENBQUMsQ0FBQztLQUNSO0dBQ0YsQ0FBQyxDQUFDO0NBQ0osQ0FBQzs7QUFHRixhQUFhLENBQUMsU0FBUyxDQUFDLFdBQVcsR0FBRyxVQUFTLE1BQU0sRUFBRTtBQUNyRCxTQUFPLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7Q0FDN0MsQ0FBQzs7QUFFRixhQUFhLENBQUMsU0FBUyxDQUFDLFlBQVksR0FBRyxVQUFTLE1BQU0sRUFBRTtBQUN0RCxTQUFPLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUM7Q0FDOUMsQ0FBQzs7cUJBRWEsYUFBYSIsImZpbGUiOiJ0YWJsZWNvbXBpbGVyLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLyogZXNsaW50IG1heC1sZW46MCAqL1xuXG4vLyBUYWJsZSBDb21waWxlclxuLy8gLS0tLS0tLVxuaW1wb3J0IHsgcHVzaEFkZGl0aW9uYWwsIHB1c2hRdWVyeSB9IGZyb20gJy4vaGVscGVycyc7XG5pbXBvcnQgKiBhcyBoZWxwZXJzIGZyb20gJy4uL2hlbHBlcnMnO1xuaW1wb3J0IHsgZ3JvdXBCeSwgcmVkdWNlLCBtYXAsIGZpcnN0LCB0YWlsLCBpc0VtcHR5LCBpbmRleE9mLCBpc0FycmF5IH0gZnJvbSAnbG9kYXNoJ1xuXG5mdW5jdGlvbiBUYWJsZUNvbXBpbGVyKGNsaWVudCwgdGFibGVCdWlsZGVyKSB7XG4gIHRoaXMuY2xpZW50ID0gY2xpZW50XG4gIHRoaXMubWV0aG9kID0gdGFibGVCdWlsZGVyLl9tZXRob2Q7XG4gIHRoaXMuc2NoZW1hTmFtZVJhdyA9IHRhYmxlQnVpbGRlci5fc2NoZW1hTmFtZTtcbiAgdGhpcy50YWJsZU5hbWVSYXcgPSB0YWJsZUJ1aWxkZXIuX3RhYmxlTmFtZTtcbiAgdGhpcy5zaW5nbGUgPSB0YWJsZUJ1aWxkZXIuX3NpbmdsZTtcbiAgdGhpcy5ncm91cGVkID0gZ3JvdXBCeSh0YWJsZUJ1aWxkZXIuX3N0YXRlbWVudHMsICdncm91cGluZycpO1xuICB0aGlzLmZvcm1hdHRlciA9IGNsaWVudC5mb3JtYXR0ZXIoKTtcbiAgdGhpcy5zZXF1ZW5jZSA9IFtdO1xuICB0aGlzLl9mb3JtYXR0aW5nID0gY2xpZW50LmNvbmZpZyAmJiBjbGllbnQuY29uZmlnLmZvcm1hdHRpbmdcbn1cblRhYmxlQ29tcGlsZXIucHJvdG90eXBlLmFsdGVyQ29sdW1uUHJlZml4ID0gJ21vZGlmeSBjb2x1bW4nO1xuXG5UYWJsZUNvbXBpbGVyLnByb3RvdHlwZS5wdXNoUXVlcnkgPSBwdXNoUXVlcnlcblxuVGFibGVDb21waWxlci5wcm90b3R5cGUucHVzaEFkZGl0aW9uYWwgPSBwdXNoQWRkaXRpb25hbFxuXG4vLyBDb252ZXJ0IHRoZSB0YWJsZUNvbXBpbGVyIHRvU1FMXG5UYWJsZUNvbXBpbGVyLnByb3RvdHlwZS50b1NRTCA9IGZ1bmN0aW9uICgpIHtcbiAgdGhpc1t0aGlzLm1ldGhvZF0oKTtcbiAgcmV0dXJuIHRoaXMuc2VxdWVuY2U7XG59O1xuXG5UYWJsZUNvbXBpbGVyLnByb3RvdHlwZS5sb3dlckNhc2UgPSB0cnVlO1xuXG4vLyBDb2x1bW4gQ29tcGlsYXRpb25cbi8vIC0tLS0tLS1cblxuLy8gSWYgdGhpcyBpcyBhIHRhYmxlIFwiY3JlYXRpb25cIiwgd2UgbmVlZCB0byBmaXJzdCBydW4gdGhyb3VnaCBhbGxcbi8vIG9mIHRoZSBjb2x1bW5zIHRvIGJ1aWxkIHRoZW0gaW50byBhIHNpbmdsZSBzdHJpbmcsXG4vLyBhbmQgdGhlbiBydW4gdGhyb3VnaCBhbnl0aGluZyBlbHNlIGFuZCBwdXNoIGl0IHRvIHRoZSBxdWVyeSBzZXF1ZW5jZS5cblRhYmxlQ29tcGlsZXIucHJvdG90eXBlLmNyZWF0ZUFsdGVyVGFibGVNZXRob2RzID0gbnVsbDtcblRhYmxlQ29tcGlsZXIucHJvdG90eXBlLmNyZWF0ZSA9IGZ1bmN0aW9uIChpZk5vdCkge1xuICBjb25zdCBjb2x1bW5zID0gdGhpcy5nZXRDb2x1bW5zKCk7XG4gIGNvbnN0IGNvbHVtblR5cGVzID0gdGhpcy5nZXRDb2x1bW5UeXBlcyhjb2x1bW5zKTtcbiAgaWYgKHRoaXMuY3JlYXRlQWx0ZXJUYWJsZU1ldGhvZHMpIHtcbiAgICB0aGlzLmFsdGVyVGFibGVGb3JDcmVhdGUoY29sdW1uVHlwZXMpO1xuICB9XG4gIHRoaXMuY3JlYXRlUXVlcnkoY29sdW1uVHlwZXMsIGlmTm90KTtcbiAgdGhpcy5jb2x1bW5RdWVyaWVzKGNvbHVtbnMpO1xuICBkZWxldGUgdGhpcy5zaW5nbGUuY29tbWVudDtcbiAgdGhpcy5hbHRlclRhYmxlKCk7XG59O1xuXG4vLyBPbmx5IGNyZWF0ZSB0aGUgdGFibGUgaWYgaXQgZG9lc24ndCBleGlzdC5cblRhYmxlQ29tcGlsZXIucHJvdG90eXBlLmNyZWF0ZUlmTm90ID0gZnVuY3Rpb24gKCkge1xuICB0aGlzLmNyZWF0ZSh0cnVlKTtcbn07XG5cbi8vIElmIHdlJ3JlIGFsdGVyaW5nIHRoZSB0YWJsZSwgd2UgbmVlZCB0byBvbmUtYnktb25lXG4vLyBnbyB0aHJvdWdoIGFuZCBoYW5kbGUgZWFjaCBvZiB0aGUgcXVlcmllcyBhc3NvY2lhdGVkXG4vLyB3aXRoIGFsdGVyaW5nIHRoZSB0YWJsZSdzIHNjaGVtYS5cblRhYmxlQ29tcGlsZXIucHJvdG90eXBlLmFsdGVyID0gZnVuY3Rpb24gKCkge1xuICBjb25zdCBjb2x1bW5zID0gdGhpcy5nZXRDb2x1bW5zKCk7XG4gIGNvbnN0IGNvbHVtblR5cGVzID0gdGhpcy5nZXRDb2x1bW5UeXBlcyhjb2x1bW5zKTtcbiAgdGhpcy5hZGRDb2x1bW5zKGNvbHVtblR5cGVzKTtcbiAgdGhpcy5jb2x1bW5RdWVyaWVzKGNvbHVtbnMpO1xuICB0aGlzLmFsdGVyVGFibGUoKTtcbn07XG5cblRhYmxlQ29tcGlsZXIucHJvdG90eXBlLmZvcmVpZ24gPSBmdW5jdGlvbiAoZm9yZWlnbkRhdGEpIHtcbiAgaWYgKGZvcmVpZ25EYXRhLmluVGFibGUgJiYgZm9yZWlnbkRhdGEucmVmZXJlbmNlcykge1xuICAgIGNvbnN0IGtleU5hbWUgPSBmb3JlaWduRGF0YS5mb3JlaWduS2V5TmFtZSA/IGZvcmVpZ25EYXRhLmZvcmVpZ25LZXlOYW1lIDogdGhpcy5faW5kZXhDb21tYW5kKCdmb3JlaWduJywgdGhpcy50YWJsZU5hbWVSYXcsIGZvcmVpZ25EYXRhLmNvbHVtbik7XG4gICAgY29uc3QgY29sdW1uID0gdGhpcy5mb3JtYXR0ZXIuY29sdW1uaXplKGZvcmVpZ25EYXRhLmNvbHVtbik7XG4gICAgY29uc3QgcmVmZXJlbmNlcyA9IHRoaXMuZm9ybWF0dGVyLmNvbHVtbml6ZShmb3JlaWduRGF0YS5yZWZlcmVuY2VzKTtcbiAgICBjb25zdCBpblRhYmxlID0gdGhpcy5mb3JtYXR0ZXIud3JhcChmb3JlaWduRGF0YS5pblRhYmxlKTtcbiAgICBjb25zdCBvblVwZGF0ZSA9IGZvcmVpZ25EYXRhLm9uVXBkYXRlID8gKHRoaXMubG93ZXJDYXNlID8gJyBvbiB1cGRhdGUgJyA6ICcgT04gVVBEQVRFICcpICsgZm9yZWlnbkRhdGEub25VcGRhdGUgOiAnJztcbiAgICBjb25zdCBvbkRlbGV0ZSA9IGZvcmVpZ25EYXRhLm9uRGVsZXRlID8gKHRoaXMubG93ZXJDYXNlID8gJyBvbiBkZWxldGUgJyA6ICcgT04gREVMRVRFICcpICsgZm9yZWlnbkRhdGEub25EZWxldGUgOiAnJztcbiAgICBpZiAodGhpcy5sb3dlckNhc2UpIHtcbiAgICAgIHRoaXMucHVzaFF1ZXJ5KCghdGhpcy5mb3JDcmVhdGUgPyBgYWx0ZXIgdGFibGUgJHt0aGlzLnRhYmxlTmFtZSgpfSBhZGQgYCA6ICcnKSArICdjb25zdHJhaW50ICcgKyBrZXlOYW1lICsgJyAnICtcbiAgICAgICAgJ2ZvcmVpZ24ga2V5ICgnICsgY29sdW1uICsgJykgcmVmZXJlbmNlcyAnICsgaW5UYWJsZSArICcgKCcgKyByZWZlcmVuY2VzICsgJyknICsgb25VcGRhdGUgKyBvbkRlbGV0ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMucHVzaFF1ZXJ5KCghdGhpcy5mb3JDcmVhdGUgPyBgQUxURVIgVEFCTEUgJHt0aGlzLnRhYmxlTmFtZSgpfSBBREQgYCA6ICcnKSArICdDT05TVFJBSU5UICcgKyBrZXlOYW1lICsgJyAnICtcbiAgICAgICAgJ0ZPUkVJR04gS0VZICgnICsgY29sdW1uICsgJykgUkVGRVJFTkNFUyAnICsgaW5UYWJsZSArICcgKCcgKyByZWZlcmVuY2VzICsgJyknICsgb25VcGRhdGUgKyBvbkRlbGV0ZSk7XG4gICAgfVxuICB9XG59O1xuXG4vLyBHZXQgYWxsIG9mIHRoZSBjb2x1bW4gc3FsICYgYmluZGluZ3MgaW5kaXZpZHVhbGx5IGZvciBidWlsZGluZyB0aGUgdGFibGUgcXVlcmllcy5cblRhYmxlQ29tcGlsZXIucHJvdG90eXBlLmdldENvbHVtblR5cGVzID0gY29sdW1ucyA9PlxuICByZWR1Y2UobWFwKGNvbHVtbnMsIGZpcnN0KSwgZnVuY3Rpb24gKG1lbW8sIGNvbHVtbikge1xuICAgIG1lbW8uc3FsLnB1c2goY29sdW1uLnNxbCk7XG4gICAgbWVtby5iaW5kaW5ncy5jb25jYXQoY29sdW1uLmJpbmRpbmdzKTtcbiAgICByZXR1cm4gbWVtbztcbiAgfSwgeyBzcWw6IFtdLCBiaW5kaW5nczogW10gfSlcbjtcblxuLy8gQWRkcyBhbGwgb2YgdGhlIGFkZGl0aW9uYWwgcXVlcmllcyBmcm9tIHRoZSBcImNvbHVtblwiXG5UYWJsZUNvbXBpbGVyLnByb3RvdHlwZS5jb2x1bW5RdWVyaWVzID0gZnVuY3Rpb24gKGNvbHVtbnMpIHtcbiAgY29uc3QgcXVlcmllcyA9IHJlZHVjZShtYXAoY29sdW1ucywgdGFpbCksIGZ1bmN0aW9uIChtZW1vLCBjb2x1bW4pIHtcbiAgICBpZiAoIWlzRW1wdHkoY29sdW1uKSkgcmV0dXJuIG1lbW8uY29uY2F0KGNvbHVtbik7XG4gICAgcmV0dXJuIG1lbW87XG4gIH0sIFtdKTtcbiAgZm9yIChsZXQgaSA9IDAsIGwgPSBxdWVyaWVzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgIHRoaXMucHVzaFF1ZXJ5KHF1ZXJpZXNbaV0pO1xuICB9XG59O1xuXG4vLyBBZGQgYSBuZXcgY29sdW1uLlxuVGFibGVDb21waWxlci5wcm90b3R5cGUuYWRkQ29sdW1uc1ByZWZpeCA9ICdhZGQgY29sdW1uICc7XG5cbi8vIEFsbCBvZiB0aGUgY29sdW1ucyB0byBcImFkZFwiIGZvciB0aGUgcXVlcnlcblRhYmxlQ29tcGlsZXIucHJvdG90eXBlLmFkZENvbHVtbnMgPSBmdW5jdGlvbiAoY29sdW1ucykge1xuICBpZiAoY29sdW1ucy5zcWwubGVuZ3RoID4gMCkge1xuICAgIGNvbnN0IGNvbHVtblNxbCA9IG1hcChjb2x1bW5zLnNxbCwgKGNvbHVtbikgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuYWRkQ29sdW1uc1ByZWZpeCArIGNvbHVtbjtcbiAgICB9KTtcbiAgICB0aGlzLnB1c2hRdWVyeSh7XG4gICAgICBzcWw6ICh0aGlzLmxvd2VyQ2FzZSA/ICdhbHRlciB0YWJsZSAnIDogJ0FMVEVSIFRBQkxFICcpICsgdGhpcy50YWJsZU5hbWUoKSArICcgJyArIGNvbHVtblNxbC5qb2luKCcsICcpLFxuICAgICAgYmluZGluZ3M6IGNvbHVtbnMuYmluZGluZ3NcbiAgICB9KTtcbiAgfVxufTtcblxuLy8gQ29tcGlsZSB0aGUgY29sdW1ucyBhcyBuZWVkZWQgZm9yIHRoZSBjdXJyZW50IGNyZWF0ZSBvciBhbHRlciB0YWJsZVxuVGFibGVDb21waWxlci5wcm90b3R5cGUuZ2V0Q29sdW1ucyA9IGZ1bmN0aW9uICgpIHtcbiAgY29uc3QgY29sdW1ucyA9IHRoaXMuZ3JvdXBlZC5jb2x1bW5zIHx8IFtdO1xuICByZXR1cm4gY29sdW1ucy5tYXAoY29sdW1uID0+XG4gICAgdGhpcy5jbGllbnQuY29sdW1uQ29tcGlsZXIodGhpcywgY29sdW1uLmJ1aWxkZXIpLnRvU1FMKClcbiAgKTtcbn07XG5cblRhYmxlQ29tcGlsZXIucHJvdG90eXBlLnRhYmxlTmFtZSA9IGZ1bmN0aW9uICgpIHtcbiAgY29uc3QgbmFtZSA9IHRoaXMuc2NoZW1hTmFtZVJhdyA/XG4gICAgYCR7dGhpcy5zY2hlbWFOYW1lUmF3fS4ke3RoaXMudGFibGVOYW1lUmF3fWBcbiAgICA6IHRoaXMudGFibGVOYW1lUmF3O1xuXG4gIHJldHVybiB0aGlzLmZvcm1hdHRlci53cmFwKG5hbWUpO1xufTtcblxuLy8gR2VuZXJhdGUgYWxsIG9mIHRoZSBhbHRlciBjb2x1bW4gc3RhdGVtZW50cyBuZWNlc3NhcnkgZm9yIHRoZSBxdWVyeS5cblRhYmxlQ29tcGlsZXIucHJvdG90eXBlLmFsdGVyVGFibGUgPSBmdW5jdGlvbiAoKSB7XG4gIGNvbnN0IGFsdGVyVGFibGUgPSB0aGlzLmdyb3VwZWQuYWx0ZXJUYWJsZSB8fCBbXTtcbiAgZm9yIChsZXQgaSA9IDAsIGwgPSBhbHRlclRhYmxlLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgIGNvbnN0IHN0YXRlbWVudCA9IGFsdGVyVGFibGVbaV07XG4gICAgaWYgKHRoaXNbc3RhdGVtZW50Lm1ldGhvZF0pIHtcbiAgICAgIHRoaXNbc3RhdGVtZW50Lm1ldGhvZF0uYXBwbHkodGhpcywgc3RhdGVtZW50LmFyZ3MpO1xuICAgIH0gZWxzZSB7XG4gICAgICBoZWxwZXJzLmVycm9yKGBEZWJ1ZzogJHtzdGF0ZW1lbnQubWV0aG9kfSBkb2VzIG5vdCBleGlzdGApO1xuICAgIH1cbiAgfVxuICBmb3IgKGNvbnN0IGl0ZW0gaW4gdGhpcy5zaW5nbGUpIHtcbiAgICBpZiAodHlwZW9mIHRoaXNbaXRlbV0gPT09ICdmdW5jdGlvbicpIHRoaXNbaXRlbV0odGhpcy5zaW5nbGVbaXRlbV0pO1xuICB9XG59O1xuXG5UYWJsZUNvbXBpbGVyLnByb3RvdHlwZS5hbHRlclRhYmxlRm9yQ3JlYXRlID0gZnVuY3Rpb24gKGNvbHVtblR5cGVzKSB7XG4gIHRoaXMuZm9yQ3JlYXRlID0gdHJ1ZTtcbiAgY29uc3Qgc2F2ZWRTZXF1ZW5jZSA9IHRoaXMuc2VxdWVuY2U7XG4gIGNvbnN0IGFsdGVyVGFibGUgPSB0aGlzLmdyb3VwZWQuYWx0ZXJUYWJsZSB8fCBbXTtcbiAgdGhpcy5ncm91cGVkLmFsdGVyVGFibGUgPSBbXTtcbiAgZm9yIChsZXQgaSA9IDAsIGwgPSBhbHRlclRhYmxlLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgIGNvbnN0IHN0YXRlbWVudCA9IGFsdGVyVGFibGVbaV07XG4gICAgaWYgKGluZGV4T2YodGhpcy5jcmVhdGVBbHRlclRhYmxlTWV0aG9kcywgc3RhdGVtZW50Lm1ldGhvZCkgPCAwKSB7XG4gICAgICB0aGlzLmdyb3VwZWQuYWx0ZXJUYWJsZS5wdXNoKHN0YXRlbWVudCk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgaWYgKHRoaXNbc3RhdGVtZW50Lm1ldGhvZF0pIHtcbiAgICAgIHRoaXMuc2VxdWVuY2UgPSBbXTtcbiAgICAgIHRoaXNbc3RhdGVtZW50Lm1ldGhvZF0uYXBwbHkodGhpcywgc3RhdGVtZW50LmFyZ3MpO1xuICAgICAgY29sdW1uVHlwZXMuc3FsLnB1c2godGhpcy5zZXF1ZW5jZVswXS5zcWwpO1xuICAgIH0gZWxzZSB7XG4gICAgICBoZWxwZXJzLmVycm9yKGBEZWJ1ZzogJHtzdGF0ZW1lbnQubWV0aG9kfSBkb2VzIG5vdCBleGlzdGApO1xuICAgIH1cbiAgfVxuICB0aGlzLnNlcXVlbmNlID0gc2F2ZWRTZXF1ZW5jZTtcbiAgdGhpcy5mb3JDcmVhdGUgPSBmYWxzZTtcbn07XG5cblxuLy8gRHJvcCB0aGUgaW5kZXggb24gdGhlIGN1cnJlbnQgdGFibGUuXG5UYWJsZUNvbXBpbGVyLnByb3RvdHlwZS5kcm9wSW5kZXggPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgdGhpcy5wdXNoUXVlcnkoYGRyb3AgaW5kZXgke3ZhbHVlfWApO1xufTtcblxuLy8gRHJvcCB0aGUgdW5pcXVlXG5UYWJsZUNvbXBpbGVyLnByb3RvdHlwZS5kcm9wVW5pcXVlID1cblRhYmxlQ29tcGlsZXIucHJvdG90eXBlLmRyb3BGb3JlaWduID0gZnVuY3Rpb24gKCkge1xuICB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBpbXBsZW1lbnRlZCBpbiB0aGUgZGlhbGVjdCBkcml2ZXInKTtcbn07XG5cblRhYmxlQ29tcGlsZXIucHJvdG90eXBlLmRyb3BDb2x1bW5QcmVmaXggPSAnZHJvcCBjb2x1bW4gJztcblRhYmxlQ29tcGlsZXIucHJvdG90eXBlLmRyb3BDb2x1bW4gPSBmdW5jdGlvbiAoKSB7XG4gIGNvbnN0IGNvbHVtbnMgPSBoZWxwZXJzLm5vcm1hbGl6ZUFyci5hcHBseShudWxsLCBhcmd1bWVudHMpO1xuICBjb25zdCBkcm9wcyA9IG1hcChpc0FycmF5KGNvbHVtbnMpID8gY29sdW1ucyA6IFtjb2x1bW5zXSwgKGNvbHVtbikgPT4ge1xuICAgIHJldHVybiB0aGlzLmRyb3BDb2x1bW5QcmVmaXggKyB0aGlzLmZvcm1hdHRlci53cmFwKGNvbHVtbik7XG4gIH0pO1xuICB0aGlzLnB1c2hRdWVyeShcbiAgICAodGhpcy5sb3dlckNhc2UgPyAnYWx0ZXIgdGFibGUgJyA6ICdBTFRFUiBUQUJMRSAnKSArXG4gICAgdGhpcy50YWJsZU5hbWUoKSArICcgJyArIGRyb3BzLmpvaW4oJywgJylcbiAgKTtcbn07XG5cbi8vIElmIG5vIG5hbWUgd2FzIHNwZWNpZmllZCBmb3IgdGhpcyBpbmRleCwgd2Ugd2lsbCBjcmVhdGUgb25lIHVzaW5nIGEgYmFzaWNcbi8vIGNvbnZlbnRpb24gb2YgdGhlIHRhYmxlIG5hbWUsIGZvbGxvd2VkIGJ5IHRoZSBjb2x1bW5zLCBmb2xsb3dlZCBieSBhblxuLy8gaW5kZXggdHlwZSwgc3VjaCBhcyBwcmltYXJ5IG9yIGluZGV4LCB3aGljaCBtYWtlcyB0aGUgaW5kZXggdW5pcXVlLlxuVGFibGVDb21waWxlci5wcm90b3R5cGUuX2luZGV4Q29tbWFuZCA9IGZ1bmN0aW9uICh0eXBlLCB0YWJsZU5hbWUsIGNvbHVtbnMpIHtcbiAgaWYgKCFpc0FycmF5KGNvbHVtbnMpKSBjb2x1bW5zID0gY29sdW1ucyA/IFtjb2x1bW5zXSA6IFtdO1xuICBjb25zdCB0YWJsZSA9IHRhYmxlTmFtZS5yZXBsYWNlKC9cXC58LS9nLCAnXycpO1xuICBjb25zdCBpbmRleE5hbWUgPSAodGFibGUgKyAnXycgKyBjb2x1bW5zLmpvaW4oJ18nKSArICdfJyArIHR5cGUpLnRvTG93ZXJDYXNlKCk7XG4gIHJldHVybiB0aGlzLmZvcm1hdHRlci53cmFwKGluZGV4TmFtZSk7XG59O1xuXG5cbi8vRGVmYXVsdCBpbXBsZW1lbnRhdGlvbiBvZiBzZXROdWxsYWJsZS4gT3ZlcndyaXRlIG9uIGRpYWxlY3Qtc3BlY2lmaWMgdGFibGVjb21waWxlciB3aGVuIG5lZWRlZFxuLy8oU2VlIHBvc3RncmVzL21zc3FsIGZvciByZWZlcmVuY2UpXG5UYWJsZUNvbXBpbGVyLnByb3RvdHlwZS5fc2V0TnVsbGFibGVTdGF0ZSA9IGZ1bmN0aW9uKGNvbHVtbiwgbnVsbGFibGUpIHtcbiAgbGV0IHRhYmxlTmFtZSA9IHRoaXMudGFibGVOYW1lKCk7XG4gIGxldCBjb2x1bW5OYW1lID0gdGhpcy5mb3JtYXR0ZXIuY29sdW1uaXplKGNvbHVtbik7XG4gIGxldCBhbHRlckNvbHVtblByZWZpeCA9IHRoaXMuYWx0ZXJDb2x1bW5QcmVmaXg7XG4gIHJldHVybiB0aGlzLnB1c2hRdWVyeSh7XG4gICAgc3FsOiAnU0VMRUNUIDEnLFxuICAgIG91dHB1dDogKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuY2xpZW50LnF1ZXJ5QnVpbGRlcigpLmZyb20odGhpcy50YWJsZU5hbWVSYXcpLmNvbHVtbkluZm8oY29sdW1uKVxuICAgICAgICAgIC50aGVuKChjb2x1bW5JbmZvKSA9PiB7XG4gICAgICAgICAgICBpZihpc0VtcHR5KGNvbHVtbkluZm8pKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgLnNldE51bGxhYmxlOiBDb2x1bW4gJHtjb2x1bW5OYW1lfSBkb2VzIG5vdCBleGlzdCBpbiB0YWJsZSAke3RhYmxlTmFtZX0uYClcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGxldCBudWxsYWJsZVR5cGUgPSBudWxsYWJsZSA/ICdudWxsJyA6ICdub3QgbnVsbCc7XG4gICAgICAgICAgICBsZXQgY29sdW1uVHlwZSA9IGNvbHVtbkluZm8udHlwZSArIChjb2x1bW5JbmZvLm1heExlbmd0aCA/IGAoJHtjb2x1bW5JbmZvLm1heExlbmd0aH0pYCA6ICcnKTtcbiAgICAgICAgICAgIGxldCBkZWZhdWx0VmFsdWUgPSAoY29sdW1uSW5mby5kZWZhdWx0VmFsdWUgIT09IG51bGwgJiYgY29sdW1uSW5mby5kZWZhdWx0VmFsdWUgIT09IHZvaWQgMCkgPyBgZGVmYXVsdCAnJHtjb2x1bW5JbmZvLmRlZmF1bHRWYWx1ZX0nYCA6ICcnO1xuICAgICAgICAgICAgbGV0IHNxbCA9IGBhbHRlciB0YWJsZSAke3RhYmxlTmFtZX0gJHthbHRlckNvbHVtblByZWZpeH0gJHtjb2x1bW5OYW1lfSAke2NvbHVtblR5cGV9ICR7bnVsbGFibGVUeXBlfSAke2RlZmF1bHRWYWx1ZX1gO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY2xpZW50LnJhdyhzcWwpO1xuICAgICAgICAgIH0pO1xuICAgIH1cbiAgfSk7XG59O1xuXG5cblRhYmxlQ29tcGlsZXIucHJvdG90eXBlLnNldE51bGxhYmxlID0gZnVuY3Rpb24oY29sdW1uKSB7XG4gIHJldHVybiB0aGlzLl9zZXROdWxsYWJsZVN0YXRlKGNvbHVtbiwgdHJ1ZSk7XG59O1xuXG5UYWJsZUNvbXBpbGVyLnByb3RvdHlwZS5kcm9wTnVsbGFibGUgPSBmdW5jdGlvbihjb2x1bW4pIHtcbiAgcmV0dXJuIHRoaXMuX3NldE51bGxhYmxlU3RhdGUoY29sdW1uLCBmYWxzZSk7XG59O1xuXG5leHBvcnQgZGVmYXVsdCBUYWJsZUNvbXBpbGVyO1xuIl19