let pkg = require('@architect/package')
let utils = require('@architect/utils')
let series = require('run-series')
let {initAWS, updater} = require('@architect/utils')

let print = require('./print')
let macros = require('./macros')
let before = require('./00-before')
let deploy = require('./01-deploy')
let after = require('./02-after')

/**
 * Shells out to AWS SAM for package/deploy
 *
 * @param {Object} params - parameters object
 * @param {Function} callback - a node-style errback
 * @returns {Promise} - if not callback is supplied
 */
module.exports = function samDeploy({verbose, production}, callback) {

  let stage = production? 'production' : 'staging'
  let ts = Date.now()
  let log = true
  let pretty = print({log, verbose})
  let {arc} = utils.readArc()
  let bucket = arc.aws.find(o=> o[0] === 'bucket')[1]
  let appname = arc.app[0]
  let stackname = `${utils.toLogicalID(appname)}${production? 'Production' : 'Staging'}`
  let cloudformation = pkg(arc)

  initAWS() // Load AWS creds
  let update = updater('Deploy')
  update.status(
    'Initializing deployment',
    `Stack ... ${stackname}`,
    `Bucket .. ${bucket}`,
  )

  let region = process.env.AWS_REGION
  if (!region)
    throw ReferenceError('AWS region must be configured to deploy')

  let promise
  if (!callback) {
    promise = new Promise(function ugh(res, rej) {
      callback = function errback(err, result) {
        if (err) rej(update.fail(err))
        else res(result)
      }
    })
  }

  macros(arc, cloudformation, stage, function done(err, sam) {
    if (err) callback(err)
    else {
      let nested = Object.prototype.hasOwnProperty.call(sam, `${appname}-cfn.json`)
      series([
        before.bind({}, {sam, nested, bucket, pretty, update, verbose}),
        deploy.bind({}, {appname, stackname, nested, bucket, pretty, region, update}),
        after.bind({}, {ts, arc, verbose, production, pretty, appname, stackname, stage, update}),
      ], callback)
    }
  })

  return promise
}
