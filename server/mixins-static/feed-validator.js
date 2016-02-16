var loopback = require('loopback');
var FeedData = require('../feed-data');
var FeedTypes = require('../feed-types.json');
var FieldTypes = require('../field-types');

module.exports = function (Model, mixinOptions) {

    Model.defineProperty('validated', { type: 'boolean', default: false });
    if (Model.settings.hidden) Model.settings.hidden.push('validated');
    else Model.settings.hidden = ['validated'];
    if (Model.settings.acls) {
        Model.settings.acls.push({
            accessType: 'READ',
            property: ['getData', 'getDataFormat'],
            principalType: 'ROLE',
            principalId: '$authenticated',
            permission: 'ALLOW'
        }, {
            accessType: 'WRITE',
            property: 'postData',
            principalType: 'ROLE',
            principalId: '$authenticated',
            permission: 'ALLOW'
        });
    }

    var fieldPropertyName = function () {
        switch (mixinOptions.type) {
            case FeedTypes.ATOMIC:
                return '_field';
            case FeedTypes.COMPOSED:
                return '_fields';
        }
    };

    Model.getDataFormat = function (modelId, cb) {
        Model.filteredFindById(modelId)
        .then((model) => {
            var fields = [].concat(model[fieldPropertyName()]);
            var format = {};
            for (var field of fields) {
                format[field.name] = {
                    format: FieldTypes.dataFormat(field.type),
                    required: field.required
                };
            }
            return format;
        })
        .then((format) => cb(null, format), (err) => cb(err));
    };
    Model.remoteMethod(
        'getDataFormat',
        {
            description: 'Get accepted data format for this feed',
            accessType: 'READ',
            accepts: {arg: 'id', type: 'string', required: true},
            returns: {arg: 'format', type: 'object', root: true},
            http: {verb: 'get', path: '/:id/data-format'}
        }
    );

    Model.getData = function (modelId, filter, cb) {
        Model.filteredFindById(modelId)
        .then((model) => FeedData.get(Model, {modelId, filter}))
        .then((data) => cb(null, data), (err) => cb(err));
    };
    Model.remoteMethod(
        'getData',
        {
            description: 'Get feed data with optional limit',
            accessType: 'READ',
            accepts: [
                {arg: 'id', type: 'string', required: true},
                {arg: 'filter', type: 'object', description: 'Filter defining fields, where, include, order, offset, and limit'}
            ],
            returns: {arg: 'data', type: ['object'], root: true},
            http: {verb: 'get', path: '/:id/data'}
        }
    );

    Model.postData = function (modelId, data, cb) {
        Model.filteredFindById(modelId)
        .then((model) => FeedData.insert(Model, data, {modelId}))
        .then((createdData) => cb(null, createdData), (err) => cb(err));
    };
    Model.remoteMethod(
        'postData',
        {
            description: 'Post feed data',
            accessType: 'WRITE',
            accepts: [
                {arg: 'id', type: 'string', required: true},
                {arg: 'data', type: 'object', http: {source: 'body'}}
            ],
            returns: {arg: 'created-data', type: 'object', root: true},
            http: {verb: 'post', path: '/:id/data'}
        }
    );

    Model.isValidated = function (modelId, cb) {
        Model.findById(modelId)
        .then((model) => {
            return model.validated;
        })
        .then((validated) => cb(null, validated), (err) => cb(err));
    };
    Model.remoteMethod(
        'isValidated',
        {
            description: 'Check if the feed has already been validated',
            accepts: {arg: 'id', type: 'string', required: true},
            returns: {arg: 'validated', type: 'boolean'},
            http: {verb: 'get', path: '/:id/validated'}
        }
    );

    var validateFeedFields = function (model) {
        if (mixinOptions.type !== FeedTypes.COMPOSED) return true;
        var duplicates = {};
        for (var field of model[fieldPropertyName()]) {
            var duplInfo = duplicates[field.name];
            if (typeof duplInfo === 'undefined') {
                duplicates[field.name] = [field.getId()];
            } else {
                duplicates[field.name].push(field.getId());
            }
        }
        var duplicatesLen = 0;
        for (var dupl in duplicates) {
            duplicatesLen++;
            if (duplicates[dupl].length === 1) {
                delete duplicates[dupl];
                duplicatesLen--;
            }
        }
        if (duplicatesLen === 0) {
            return true;
        } else {
            return duplicates;
        }
    };

    Model.validate = function (modelId, cb) {
        var validatedChanged = false;
        Model.findById(modelId)
        .then((model) => {
            if (!model.validated) {
                var feedFieldsValid = validateFeedFields(model);
                if (typeof feedFieldsValid === 'object') {
                    var err = new Error(`Duplicate field names: ${JSON.stringify(feedFieldsValid)}`);
                    err.statusCode = err.status = 422;
                    return Promise.reject(err);
                }
                return FeedData.create(Model, model, mixinOptions)
                .then((FeedData) => {
                    return model.updateAttribute('validated', true)
                    .then(() => {
                        validatedChanged = true;
                        return FeedData;
                    });
                });
            }
        })
        .then(FeedData => cb(null, {changed: validatedChanged}), err => cb(err));
    };
    Model.remoteMethod(
        'validate',
        {
            description: 'Validate feed for use and create data collection',
            accepts: {arg: 'id', type: 'string', required: true},
            returns: {type: 'object', root: true},
            http: {verb: 'post', path: '/:id/validate'}
        }
    );

    Model.observe('before save', function (ctx, next) {
        var hookP = Promise.resolve();
        // By default, a new instance is not validated
        if (ctx.isNewInstance === true) {
            ctx.instance.validated = false;
        } else {
            // If the model is modified and is validated, we have to forbid field modification
            // It's a way to keep consistency with data collection
            if (ctx.currentInstance && ctx.currentInstance.validated) {
                // CASE 1:
                // This is executed when the action is updateAttributes()
                // That means what we can simply remove modifications that are related to fields
                delete ctx.data[fieldPropertyName()];
            } else if (ctx.instance && ctx.instance.validated) {
                // CASE 2:
                // This is executed in all cases where one instance is modified
                // We have to check if fields have been modified, so we check currently persisted instance
                // If the fields are modified, reject the modification
                hookP = Model.findById(ctx.instance.getId())
                .then((oldInstance) => {
                    var oldFields = oldInstance[fieldPropertyName()];
                    var newFields = ctx.instance[fieldPropertyName()];
                    if (oldFields.toJSON() !== newFields.toJSON()) {
                        var err = new Error(`Fields property can't be modified on validated "${Model.modelName}" id "${ctx.instance.getId()}".`);
                        err.statusCode = err.status = 401;
                        return Promise.reject(err);
                    }
                });
            } else if (!ctx.instance) {
                // CASE 3:
                // This is executed when the action is updataOrCreate() or updateAll()
                // As in CASE 1, we could remove modifications that involve fields
                // But in this case, the user will assume that the modification has been made for all feeds, which is wrong
                // So it's simpler to return an error
                if (ctx.where.hasOwnProperty(fieldPropertyName())) {
                    hookP = Model.findOne({where: {validated: true}})
                    .then((validatedInstance) => {
                        if (validatedInstance) {
                            var err = new Error(`Update has failed. One or more instances of "${Model.modelName}" are validated.`);
                            err.statusCode = err.status = 401;
                            return Promise.reject(err);
                        }
                    });
                }
            }
        }
        hookP.then(() => next(), (err => next(err)));
    });

};
