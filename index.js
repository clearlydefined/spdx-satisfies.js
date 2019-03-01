var compare = require('spdx-compare')
var parse = require('spdx-expression-parse')
var ranges = require('spdx-ranges')

var rangesAreCompatible = function (first, second) {
  return (
    first.license === second.license ||
    ranges.some(function (range) {
      return (
        licenseInRange(first.license, range) &&
        licenseInRange(second.license, range)
      )
    })
  )
}

function licenseInRange (license, range) {
  return (
    range.indexOf(license) !== -1 ||
    range.some(function (element) {
      return (
        Array.isArray(element) &&
        element.indexOf(license) !== -1
      )
    })
  )
}

var identifierInRange = function (identifier, range) {
  return (
    identifier.license === range.license ||
    compare.gt(identifier.license, range.license) ||
    compare.eq(identifier.license, range.license)
  )
}

var licensesAreCompatible = function (first, second) {
  if (first.exception !== second.exception) {
    return false
  } else if (second.hasOwnProperty('license')) {
    if (second.hasOwnProperty('plus')) {
      if (first.hasOwnProperty('plus')) {
        // first+, second+
        return rangesAreCompatible(first, second)
      } else {
        // first, second+
        return identifierInRange(first, second)
      }
    } else {
      if (first.hasOwnProperty('plus')) {
        // first+, second
        return identifierInRange(second, first)
      } else {
        // first, second
        return first.license === second.license
      }
    }
  }
}

function normalizeGPLIdentifiers (argument) {
  var license = argument.license
  if (license) {
    if (endsWith(license, '-or-later')) {
      argument.license = license.replace('-or-later', '')
      argument.plus = true
    } else if (endsWith(license, '-only')) {
      argument.license = license.replace('-or-later', '')
      delete argument.plus
    }
  } else if (argument.left && argument.right) {
    argument.left = normalizeGPLIdentifiers(argument.left)
    argument.right = normalizeGPLIdentifiers(argument.right)
  }
  return argument
}

function endsWith (string, substring) {
  return string.indexOf(substring) === string.length - 1
}

function licenseString(e) {
  if (e.hasOwnProperty('noassertion')) return 'NOASSERTION'
  if (e.license) return `${e.license}${e.plus ? '+' : ''}${e.exception ? ` WITH ${e.exception}` : ''}`
}

/**
 * Expand an expression into an equivalent array where each entry is OR'd together and consists of the
 * left expression obejects represnting the licenses to be AND'd together to be equivalent to the original.
 * For example, (MIT OR ISC) AND GPL-3.0 would expand to [[GPL-3.0 AND MIT], [ISC AND MIT]]. Note that
 * within each array of licenses, the entries are normalized (sorted) by license name.
 * @param {*} expression
 * @returns {[string]}
 */
function expand(expression) {
  return sort(Array.from(expandInner(expression)))
}

function flatten(expression) {
  const expanded = Array.from(expandInner(expression))
  const flattened = expanded.reduce((result, clause) => {
    return { ...result, ...clause }
  }, {})
  return sort([flattened])
}

function expandInner(expression) {
  if (!expression.conjunction) return [{ [licenseString(expression)]: expression }]
  if (expression.conjunction === 'or') return [...expandInner(expression.left), ...expandInner(expression.right)]
  if (expression.conjunction === 'and') {
    var left = expandInner(expression.left)
    var right = expandInner(expression.right)
    return left.reduce((result, l) => {
      right.forEach(r => result.push({ ...l, ...r }))
      return result
    }, [])
  }
}

function sort(licenseList) {
  var sortedLicenseLists = licenseList.filter(e => Object.keys(e).length).map(e => Object.keys(e).sort())
  return sortedLicenseLists.map((list, i) => list.map(license => licenseList[i][license]))
}

function isANDCompatible(one, two) {
  return one.every(o => two.some(t => licensesAreCompatible(o, t)))
}

function satisfies(first, second, options) {
  var parser = (options || {}).parse || parse
  var one = expand(normalizeGPLIdentifiers(parser(first)))
  var two = flatten(normalizeGPLIdentifiers(parser(second)))
  return one.some(o => two.some(t => isANDCompatible(o, t)))
}

module.exports = satisfies
