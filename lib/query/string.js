'use strict';

exports.__esModule = true;

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj['default'] = obj; return newObj; } }

var _helpers = require('../helpers');

var helpers = _interopRequireWildcard(_helpers);

var SqlString = {};
exports['default'] = SqlString;

SqlString.escape = function (val, timeZone) {
  // Can't do require on top of file because Raw has not yet been initialized
  // when this file is executed for the first time.
  var Raw = require('../raw');

  if (val === null || val === undefined) {
    return 'NULL';
  }

  switch (typeof val) {
    case 'boolean':
      return val ? 'true' : 'false';
    case 'number':
      return val + '';
  }

  if (val instanceof Date) {
    val = SqlString.dateToString(val, timeZone || 'local');
  }

  if (Buffer.isBuffer(val)) {
    return SqlString.bufferToString(val);
  }

  if (Array.isArray(val)) {
    return SqlString.arrayToList(val, timeZone);
  }

  if (val instanceof Raw) {
    return val;
  }

  if (typeof val === 'object') {
    try {
      val = JSON.stringify(val);
    } catch (e) {
      helpers.warn(e);
      val = val + '';
    }
  }

  val = val.replace(/(\\\?)|[\0\n\r\b\t\\\'\x1a]/g, function (s) {
    switch (s) {
      case "\0":
        return "\\0";
      case "\n":
        return "\\n";
      case "\r":
        return "\\r";
      case "\b":
        return "\\b";
      case "\t":
        return "\\t";
      case "\x1a":
        return "\\Z";
      case "\\?":
        return "?";
      case "\'":
        return "''";
      default:
        return '\\' + s;
    }
  });
  return '\'' + val + '\'';
};

SqlString.arrayToList = function (array, timeZone) {
  var self = this;
  return array.map(function (v) {
    if (Array.isArray(v)) return '(' + SqlString.arrayToList(v, timeZone) + ')';
    return self.escape(v, timeZone);
  }).join(', ');
};

SqlString.format = function (sql, values, timeZone) {
  var self = this;
  values = values == null ? [] : [].concat(values);
  var index = 0;
  return sql.replace(/\\?\?/g, function (match) {
    if (match === '\\?') return match;
    if (index === values.length) {
      return match;
    }
    var value = values[index++];
    return self.escape(value, timeZone);
  }).replace('\\?', '?');
};

SqlString.dateToString = function (date, timeZone) {
  var dt = new Date(date);

  if (timeZone !== 'local') {
    var tz = convertTimezone(timeZone);

    dt.setTime(dt.getTime() + dt.getTimezoneOffset() * 60000);
    if (tz !== false) {
      dt.setTime(dt.getTime() + tz * 60000);
    }
  }

  var year = dt.getFullYear();
  var month = zeroPad(dt.getMonth() + 1, 2);
  var day = zeroPad(dt.getDate(), 2);
  var hour = zeroPad(dt.getHours(), 2);
  var minute = zeroPad(dt.getMinutes(), 2);
  var second = zeroPad(dt.getSeconds(), 2);
  var millisecond = zeroPad(dt.getMilliseconds(), 3);

  return year + '-' + month + '-' + day + ' ' + hour + ':' + minute + ':' + second + '.' + millisecond;
};

SqlString.bufferToString = function bufferToString(buffer) {
  return 'X\'' + buffer.toString('hex') + '\'';
};

function zeroPad(number, length) {
  number = number.toString();
  while (number.length < length) {
    number = '0' + number;
  }

  return number;
}

function convertTimezone(tz) {
  if (tz === "Z") return 0;

  var m = tz.match(/([\+\-\s])(\d\d):?(\d\d)?/);
  if (m) {
    return (m[1] === '-' ? -1 : 1) * (parseInt(m[2], 10) + (m[3] ? parseInt(m[3], 10) : 0) / 60) * 60;
  }
  return false;
}
module.exports = exports['default'];
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9xdWVyeS9zdHJpbmcuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O3VCQUF5QixZQUFZOztJQUF6QixPQUFPOztBQUVuQixJQUFNLFNBQVMsR0FBRyxFQUFFLENBQUM7cUJBQ1osU0FBUzs7QUFFbEIsU0FBUyxDQUFDLE1BQU0sR0FBRyxVQUFTLEdBQUcsRUFBRSxRQUFRLEVBQUU7OztBQUd6QyxNQUFNLEdBQUcsR0FBRyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUE7O0FBRTdCLE1BQUksR0FBRyxLQUFLLElBQUksSUFBSSxHQUFHLEtBQUssU0FBUyxFQUFFO0FBQ3JDLFdBQU8sTUFBTSxDQUFDO0dBQ2Y7O0FBRUQsVUFBUSxPQUFPLEdBQUc7QUFDaEIsU0FBSyxTQUFTO0FBQUUsYUFBTyxBQUFDLEdBQUcsR0FBSSxNQUFNLEdBQUcsT0FBTyxDQUFDO0FBQUEsQUFDaEQsU0FBSyxRQUFRO0FBQUUsYUFBTyxHQUFHLEdBQUMsRUFBRSxDQUFDO0FBQUEsR0FDOUI7O0FBRUQsTUFBSSxHQUFHLFlBQVksSUFBSSxFQUFFO0FBQ3ZCLE9BQUcsR0FBRyxTQUFTLENBQUMsWUFBWSxDQUFDLEdBQUcsRUFBRSxRQUFRLElBQUksT0FBTyxDQUFDLENBQUM7R0FDeEQ7O0FBRUQsTUFBSSxNQUFNLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUFFO0FBQ3hCLFdBQU8sU0FBUyxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsQ0FBQztHQUN0Qzs7QUFFRCxNQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUU7QUFDdEIsV0FBTyxTQUFTLENBQUMsV0FBVyxDQUFDLEdBQUcsRUFBRSxRQUFRLENBQUMsQ0FBQztHQUM3Qzs7QUFFRCxNQUFJLEdBQUcsWUFBWSxHQUFHLEVBQUU7QUFDdEIsV0FBTyxHQUFHLENBQUM7R0FDWjs7QUFFRCxNQUFJLE9BQU8sR0FBRyxLQUFLLFFBQVEsRUFBRTtBQUMzQixRQUFJO0FBQ0YsU0FBRyxH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QUFDL0IsUUFBTSxHQUFHLE1BQU0sQ0FBQyxRQUFRLEVBQUUsQ0FBQztBQUMzQixTQUFPLE1BQU0sQ0FBQyxNQUFNLEdBQUcsTUFBTSxFQUFFO0FBQzdCLFVBQU0sU0FBTyxNQUFNLEFBQUUsQ0FBQztHQUN2Qjs7QUFFRCxTQUFPLE1BQU0sQ0FBQztDQUNmOztBQUVELFNBQVMsZUFBZSxDQUFDLEVBQUUsRUFBRTtBQUMzQixNQUFJLEVBQUUsS0FBSyxHQUFHLEVBQUUsT0FBTyxDQUFDLENBQUM7O0FBRXpCLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsMkJBQTJCLENBQUMsQ0FBQztBQUNoRCxNQUFJLENBQUMsRUFBRTtBQUNMLFdBQ0UsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQSxJQUNyQixRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxHQUNsQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQSxHQUFJLEVBQUUsQ0FBQyxBQUFDLEdBQUcsRUFBRSxDQUM1QztHQUNIO0FBQ0QsU0FBTyxLQUFLLENBQUM7Q0FDZCIsImZpbGUiOiJzdHJpbmcuanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBoZWxwZXJzIGZyb20gJy4uL2hlbHBlcnMnO1xuXG5jb25zdCBTcWxTdHJpbmcgPSB7fTtcbmV4cG9ydCB7IFNxbFN0cmluZyBhcyBkZWZhdWx0IH07XG5cblNxbFN0cmluZy5lc2NhcGUgPSBmdW5jdGlvbih2YWwsIHRpbWVab25lKSB7XG4gIC8vIENhbid0IGRvIHJlcXVpcmUgb24gdG9wIG9mIGZpbGUgYmVjYXVzZSBSYXcgaGFzIG5vdCB5ZXQgYmVlbiBpbml0aWFsaXplZFxuICAvLyB3aGVuIHRoaXMgZmlsZSBpcyBleGVjdXRlZCBmb3IgdGhlIGZpcnN0IHRpbWUuXG4gIGNvbnN0IFJhdyA9IHJlcXVpcmUoJy4uL3JhdycpXG5cbiAgaWYgKHZhbCA9PT0gbnVsbCB8fCB2YWwgPT09IHVuZGVmaW5lZCkge1xuICAgIHJldHVybiAnTlVMTCc7XG4gIH1cblxuICBzd2l0Y2ggKHR5cGVvZiB2YWwpIHtcbiAgICBjYXNlICdib29sZWFuJzogcmV0dXJuICh2YWwpID8gJ3RydWUnIDogJ2ZhbHNlJztcbiAgICBjYXNlICdudW1iZXInOiByZXR1cm4gdmFsKycnO1xuICB9XG5cbiAgaWYgKHZhbCBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICB2YWwgPSBTcWxTdHJpbmcuZGF0ZVRvU3RyaW5nKHZhbCwgdGltZVpvbmUgfHwgJ2xvY2FsJyk7XG4gIH1cblxuICBpZiAoQnVmZmVyLmlzQnVmZmVyKHZhbCkpIHtcbiAgICByZXR1cm4gU3FsU3RyaW5nLmJ1ZmZlclRvU3RyaW5nKHZhbCk7XG4gIH1cblxuICBpZiAoQXJyYXkuaXNBcnJheSh2YWwpKSB7XG4gICAgcmV0dXJuIFNxbFN0cmluZy5hcnJheVRvTGlzdCh2YWwsIHRpbWVab25lKTtcbiAgfVxuXG4gIGlmICh2YWwgaW5zdGFuY2VvZiBSYXcpIHtcbiAgICByZXR1cm4gdmFsO1xuICB9XG5cbiAgaWYgKHR5cGVvZiB2YWwgPT09ICdvYmplY3QnKSB7XG4gICAgdHJ5IHtcbiAgICAgIHZhbCA9IEpTT04uc3RyaW5naWZ5KHZhbClcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBoZWxwZXJzLndhcm4oZSlcbiAgICAgIHZhbCA9IHZhbCArICcnXG4gICAgfVxuICB9XG5cbiAgdmFsID0gdmFsLnJlcGxhY2UoLyhcXFxcXFw/KXxbXFwwXFxuXFxyXFxiXFx0XFxcXFxcJ1xceDFhXS9nLCBmdW5jdGlvbihzKSB7XG4gICAgc3dpdGNoKHMpIHtcbiAgICAgIGNhc2UgXCJcXDBcIjogcmV0dXJuIFwiXFxcXDBcIjtcbiAgICAgIGNhc2UgXCJcXG5cIjogcmV0dXJuIFwiXFxcXG5cIjtcbiAgICAgIGNhc2UgXCJcXHJcIjogcmV0dXJuIFwiXFxcXHJcIjtcbiAgICAgIGNhc2UgXCJcXGJcIjogcmV0dXJuIFwiXFxcXGJcIjtcbiAgICAgIGNhc2UgXCJcXHRcIjogcmV0dXJuIFwiXFxcXHRcIjtcbiAgICAgIGNhc2UgXCJcXHgxYVwiOiByZXR1cm4gXCJcXFxcWlwiO1xuICAgICAgY2FzZSBcIlxcXFw/XCI6IHJldHVybiBcIj9cIjtcbiAgICAgIGNhc2UgXCJcXCdcIjogcmV0dXJuIFwiJydcIjtcbiAgICAgIGRlZmF1bHQ6IHJldHVybiBgXFxcXCR7c31gO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiBgJyR7dmFsfSdgO1xufTtcblxuU3FsU3RyaW5nLmFycmF5VG9MaXN0ID0gZnVuY3Rpb24oYXJyYXksIHRpbWVab25lKSB7XG4gIGNvbnN0IHNlbGYgPSB0aGlzO1xuICByZXR1cm4gYXJyYXkubWFwKGZ1bmN0aW9uKHYpIHtcbiAgICBpZiAoQXJyYXkuaXNBcnJheSh2KSkgcmV0dXJuIGAoJHtTcWxTdHJpbmcuYXJyYXlUb0xpc3QodiwgdGltZVpvbmUpfSlgO1xuICAgIHJldHVybiBzZWxmLmVzY2FwZSh2LCB0aW1lWm9uZSk7XG4gIH0pLmpvaW4oJywgJyk7XG59O1xuXG5TcWxTdHJpbmcuZm9ybWF0ID0gZnVuY3Rpb24oc3FsLCB2YWx1ZXMsIHRpbWVab25lKSB7XG4gIGNvbnN0IHNlbGYgPSB0aGlzO1xuICB2YWx1ZXMgPSB2YWx1ZXMgPT0gbnVsbCA/IFtdIDogW10uY29uY2F0KHZhbHVlcyk7XG4gIGxldCBpbmRleCA9IDA7XG4gIHJldHVybiBzcWwucmVwbGFjZSgvXFxcXD9cXD8vZywgZnVuY3Rpb24obWF0Y2gpIHtcbiAgICBpZiAobWF0Y2ggPT09ICdcXFxcPycpIHJldHVybiBtYXRjaDtcbiAgICBpZiAoaW5kZXggPT09IHZhbHVlcy5sZW5ndGgpIHtcbiAgICAgIHJldHVybiBtYXRjaDtcbiAgICB9XG4gICAgY29uc3QgdmFsdWUgPSB2YWx1ZXNbaW5kZXgrK107XG4gICAgcmV0dXJuIHNlbGYuZXNjYXBlKHZhbHVlLCB0aW1lWm9uZSlcbiAgfSkucmVwbGFjZSgnXFxcXD8nLCAnPycpO1xufTtcblxuU3FsU3RyaW5nLmRhdGVUb1N0cmluZyA9IGZ1bmN0aW9uKGRhdGUsIHRpbWVab25lKSB7XG4gIGNvbnN0IGR0ID0gbmV3IERhdGUoZGF0ZSk7XG5cbiAgaWYgKHRpbWVab25lICE9PSAnbG9jYWwnKSB7XG4gICAgY29uc3QgdHogPSBjb252ZXJ0VGltZXpvbmUodGltZVpvbmUpO1xuXG4gICAgZHQuc2V0VGltZShkdC5nZXRUaW1lKCkgKyAoZHQuZ2V0VGltZXpvbmVPZmZzZXQoKSAqIDYwMDAwKSk7XG4gICAgaWYgKHR6ICE9PSBmYWxzZSkge1xuICAgICAgZHQuc2V0VGltZShkdC5nZXRUaW1lKCkgKyAodHogKiA2MDAwMCkpO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IHllYXIgPSBkdC5nZXRGdWxsWWVhcigpO1xuICBjb25zdCBtb250aCA9IHplcm9QYWQoZHQuZ2V0TW9udGgoKSArIDEsIDIpO1xuICBjb25zdCBkYXkgPSB6ZXJvUGFkKGR0LmdldERhdGUoKSwgMik7XG4gIGNvbnN0IGhvdXIgPSB6ZXJvUGFkKGR0LmdldEhvdXJzKCksIDIpO1xuICBjb25zdCBtaW51dGUgPSB6ZXJvUGFkKGR0LmdldE1pbnV0ZXMoKSwgMik7XG4gIGNvbnN0IHNlY29uZCA9IHplcm9QYWQoZHQuZ2V0U2Vjb25kcygpLCAyKTtcbiAgY29uc3QgbWlsbGlzZWNvbmQgPSB6ZXJvUGFkKGR0LmdldE1pbGxpc2Vjb25kcygpLCAzKTtcblxuICByZXR1cm4gKFxuICAgIHllYXIgKyAnLScgKyBtb250aCArICctJyArIGRheSArICcgJyArIGhvdXIgKyAnOicgKyBtaW51dGUgKyAnOicgK1xuICAgIHNlY29uZCArICcuJyArIG1pbGxpc2Vjb25kXG4gICk7XG59O1xuXG5TcWxTdHJpbmcuYnVmZmVyVG9TdHJpbmcgPSBmdW5jdGlvbiBidWZmZXJUb1N0cmluZyhidWZmZXIpIHtcbiAgcmV0dXJuIGBYJyR7YnVmZmVyLnRvU3RyaW5nKCdoZXgnKX0nYDtcbn1cblxuZnVuY3Rpb24gemVyb1BhZChudW1iZXIsIGxlbmd0aCkge1xuICBudW1iZXIgPSBudW1iZXIudG9TdHJpbmcoKTtcbiAgd2hpbGUgKG51bWJlci5sZW5ndGggPCBsZW5ndGgpIHtcbiAgICBudW1iZXIgPSBgMCR7bnVtYmVyfWA7XG4gIH1cblxuICByZXR1cm4gbnVtYmVyO1xufVxuXG5mdW5jdGlvbiBjb252ZXJ0VGltZXpvbmUodHopIHtcbiAgaWYgKHR6ID09PSBcIlpcIikgcmV0dXJuIDA7XG5cbiAgY29uc3QgbSA9IHR6Lm1hdGNoKC8oW1xcK1xcLVxcc10pKFxcZFxcZCk6PyhcXGRcXGQpPy8pO1xuICBpZiAobSkge1xuICAgIHJldHVybiAoXG4gICAgICAobVsxXSA9PT0gJy0nID8gLTEgOiAxKSAqXG4gICAgICAocGFyc2VJbnQobVsyXSwgMTApICtcbiAgICAgICgobVszXSA/IHBhcnNlSW50KG1bM10sIDEwKSA6IDApIC8gNjApKSAqIDYwXG4gICAgKTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59XG4iXX0=