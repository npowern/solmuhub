'use strict';

var app = require('../server');
var Helper = require('./test-helper')(app);

var request = require('supertest');
var chai = require('chai');
var chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
var expect = chai.expect;

var testUserCreds = {email: 'testuser@hub.fi', password: 'testPassword'};

describe("IoT Hub API, Authentication", function () {

    var userId;
    var userToken;

    before(function () {
        return Helper.createUser(testUserCreds, {name: 'admin'})
        .then((user) => {
            userId = user.id;
            return Helper.login(testUserCreds);
        })
        .then((tokenId) => {
            userToken = tokenId;
        });
    });

    after(function () {
        return Helper.removeUser(userId, userToken);
    });

    it("Non autenticated request should be rejected by default", function (done) {
        request(app)
        .get('/api/feeds')
        .expect(401, done);
    });

    it("Authenticated request by admin", function () {
        return new Promise((resolve, reject) => {
            request(app)
            .get('/api/feeds')
            .set('Authorization', userToken)
            .expect(200, (err, res) => {
                if (err) reject(err);
                resolve(res.body);
            });
        });
    });
});


describe('IoT Hub API, Authenticated', function () {

    var token;
    var testUserId;

    before(function () {
        return Helper.createUser(testUserCreds, {name: 'admin'})
        .then((user) => {
            testUserId = user.id;
            return Helper.login(testUserCreds);
        })
        .then((tokenId) => {
            token = tokenId;
        });
    });

    after(function () {
        return Helper.removeUser(testUserId, token);
    });

    describe('Fields', function () {

        beforeEach(function () {
            return Helper.cleanAllAtomicFeeds(token, {force: true});
        });

        after(function () {
            return Helper.cleanAllAtomicFeeds(token, {force: true});
        });

        it('Should find a previously inserted field', function () {
            return Helper.insertValidAtomicFeed(token)
            .then((args) => {
                var fieldId = args[1];
                return app.models.Field.find()
                .then((fields) => {
                    expect(fields).to.have.length(1);
                    expect(fields[0].getId() + '').to.equal(fieldId + '');
                });
            });
        });

    });

    describe('Atomic feeds', function () {

        beforeEach(function () {
            return Helper.cleanAllAtomicFeeds(token, {force: true});
        });

        after(function () {
            return Helper.cleanAllAtomicFeeds(token, {force: true});
        });

        it('Valid atomic feed', function () {
            return Helper.insertValidAtomicFeed(token);
        });

        it("Invalid atomic feed (built-in validation mecanism)", function (done) {
            // the name field is missing
            var invalidFeed = Helper.validAtomicFeed();
            delete invalidFeed.name;
            request(app)
            .post('/api/feeds/atomic')
            .set('Authorization', token)
            .type('json')
            .send(JSON.stringify(invalidFeed))
            .expect(422, done);
        });

        it('Should find a previously inserted feed', function () {
            return Helper.insertValidAtomicFeed(token)
            .then((args) => {
                var insertedId = args[0],
                    fieldId = args[1];
                return new Promise((resolve, reject) => {
                    request(app)
                    .get(`/api/feeds/atomic/${insertedId}`)
                    .set('Authorization', token)
                    .expect(200, (err, res) => {
                        if (err) reject(err);
                        expect(res.body).to.eql(Helper.validAtomicFeed({
                            id: insertedId,
                            _field: Helper.validField({id: fieldId})
                        }));
                        resolve();
                    });
                });
            });
        });

        it('Should delete a previously inserted feed', function () {
            return Helper.insertValidAtomicFeed(token)
            .then((args) => {
                var insertedId = args[0];
                return Helper.deleteFeed(token, {type: 'atomic', id: insertedId});
            })
            .then(() => Helper.getFeedsOfType(token, 'atomic'))
            .then((feeds) => {
                expect(feeds).to.have.length(0);
            });
        });

        it('should delete associated field on deletion', function () {
            return Helper.insertValidAtomicFeed(token)
            .then((args) => {
                var insertedId = args[0];
                var insertedFieldId = args[1];
                return Helper.deleteFeed(token, {type: 'atomic', id: insertedId})
                .then(() => {
                    return app.models.Field.exists(insertedFieldId);
                });
            })
            .then((fieldExists) => {
                expect(fieldExists).to.equal(false);
            });
        });

    });

    describe("Composed feeds", function () {

        beforeEach(function () {
            return Helper.cleanAllComposedFeeds(token, {force: true});
        });

        after(function () {
            return Helper.cleanAllComposedFeeds(token, {force: true});
        });

        it("Valid composed feed", function () {
            return Helper.insertValidComposedFeed(token);
        });

        it("Invalid composed feed (built-in validation mecanism)", function (done) {
            // the name field is missing
            var invalidFeed = Helper.validComposedFeed();
            delete invalidFeed.name;
            request(app)
            .post('/api/feeds/composed')
            .set('Authorization', token)
            .type('json')
            .send(JSON.stringify(invalidFeed))
            .expect(422, done);
        });

        it('Should find a previously inserted feed', function () {
            return Helper.insertValidComposedFeed(token)
            .then((args) => {
                var insertedId = args[0],
                    fieldId = args[1];
                return new Promise((resolve, reject) => {
                    request(app)
                    .get(`/api/feeds/composed/${insertedId}`)
                    .set('Authorization', token)
                    .expect(200, (err, res) => {
                        if (err) reject(err);
                        expect(res.body).to.eql(Helper.validComposedFeed({
                            id: insertedId,
                            _fields: [
                                Helper.validField({id: fieldId})
                            ]
                        }));
                        resolve();
                    });
                });
            });
        });

        it('Should delete a previously inserted feed', function () {
            return Helper.insertValidComposedFeed(token)
            .then((args) => {
                var insertedId = args[0];
                return Helper.deleteFeed(token, {type: 'composed', id: insertedId});
            })
            .then(() => Helper.getFeedsOfType(token, 'composed'))
            .then((feeds) => {
                expect(feeds).to.have.length(0);
            });
        });

        it('should delete associated field on deletion', function () {
            return Helper.insertValidComposedFeed(token)
            .then((args) => {
                var insertedId = args[0];
                var insertedFieldId = args[1];
                return Helper.deleteFeed(token, {type: 'composed', id: insertedId})
                .then(() => {
                    return app.models.Field.exists(insertedFieldId);
                });
            })
            .then((fieldExists) => {
                expect(fieldExists).to.equal(false);
            });
        });

    });

    describe('Executable feeds', function () {

        beforeEach(function () {
            return Helper.cleanAllExecutableFeeds(token);
        });

        after(function () {
            return Helper.cleanAllExecutableFeeds(token);
        });

        it("Valid executable feed", function () {
            return Helper.insertValidExecutableFeed(token);
        });

        it("Invalid executable feed (built-in validation mecanism)", function (done) {
            // the name field is missing
            var invalidFeed = Helper.validExecutableFeed();
            delete invalidFeed.name;
            request(app)
            .post('/api/feeds/executable')
            .set('Authorization', token)
            .type('json')
            .send(JSON.stringify(invalidFeed))
            .expect(422, done);
        });

        it('Should find a previously inserted feed', function () {
            return Helper.insertValidExecutableFeed(token)
            .then((insertedId) => {
                return new Promise((resolve, reject) => {
                    request(app)
                    .get(`/api/feeds/executable/${insertedId}`)
                    .set('Authorization', token)
                    .expect(200, (err, res) => {
                        if (err) reject(err);
                        expect(res.body).to.eql(Helper.validExecutableFeed({
                            id: insertedId
                        }));
                        resolve();
                    });
                });
            });
        });

        it('Should delete a previously inserted feed', function () {
            return Helper.insertValidExecutableFeed(token)
            .then((insertedId) => {
                return Helper.deleteFeed(token, {type: 'executable', id: insertedId});
            })
            .then(() => Helper.getFeedsOfType(token, 'executable'))
            .then((feeds) => {
                expect(feeds).to.have.length(0);
            });
        });

    });

    describe('General querying', function () {

        var getAllFeeds = function (token) {
            return new Promise((resolve, reject) => {
                request(app)
                .get('/api/feeds')
                .set('Authorization', token)
                .expect(200, function (err, res) {
                    if (err) reject(err);
                    resolve(res.body);
                });
            });
        };

        var cleanAllFeeds = function (token, options) {
            options = options || {};
            return Promise.all([
                Helper.cleanAllAtomicFeeds(token, {force: options.force}),
                Helper.cleanAllComposedFeeds(token, {force: options.force}),
                Helper.cleanAllExecutableFeeds(token)
            ]);
        };

        beforeEach(function () {
            return cleanAllFeeds(token, {force: true});
        });

        after(function () {
            return cleanAllFeeds(token, {force: true});
        });

        it('Basic empty response for all feeds', function () {
            return getAllFeeds(token)
            .then((body) => {
                expect(body).to.eql({count: 0, types: []});
            });
        });

        it('Getting all types of feeds after insertion', function () {
            return Helper.insertValidAtomicFeed(token)
            .then((atomicArgs) => {
                var atomicId = atomicArgs[0],
                    atomicFieldId = atomicArgs[1];
                return Helper.validateFeed(token, {feedType: 'atomic', id: atomicId})
                .then(() => Helper.insertValidComposedFeed(token))
                .then((composedArgs) => {
                    var composedId = composedArgs[0],
                        composedFieldId = composedArgs[1];
                    return Helper.validateFeed(token, {feedType: 'composed', id: composedId})
                    .then(() => Helper.insertValidExecutableFeed(token))
                    .then((executableId) => {
                        return getAllFeeds(token)
                        .then((body) => {
                            expect(body.count).to.equal(3);
                            expect(body.types).to.have.members(['atomic', 'composed', 'executable']);
                            // AtomicFeed
                            expect(body.atomic).to.exist;
                            expect(body.atomic[0]).to.eql(Helper.validAtomicFeed({
                                id: atomicId,
                                _field: Helper.validField({id: atomicFieldId})
                            }));
                            // ComposedFeed
                            expect(body.composed).to.exist;
                            expect(body.composed[0]).to.eql(Helper.validComposedFeed({
                                id: composedId,
                                _fields: [
                                    Helper.validField({id: composedFieldId})
                                ]
                            }));
                            // ExecutableFeed
                            expect(body.executable).to.exist;
                            expect(body.executable[0]).to.eql(Helper.validExecutableFeed({
                                id: executableId
                            }));
                        });
                    });
                });
            });
        });

    });
});

describe('Admin/Client access', function () {

    var adminId;
    var adminToken;
    var clientCreds = {email: 'testClient@hub.fi', password: 'testClientPassword'};
    var clientRoleId;
    var clientId;
    var clientToken;

    before(function () {
        return Helper.createUser(testUserCreds, {name: 'admin'})
        .then((testUser) => {
            adminId = testUser.id;
            return Helper.login(testUserCreds);
        })
        .then((adminTokenId) => {
            adminToken = adminTokenId;
            // Create client role
            return new Promise((resolve, reject) => {
                app.models.HubRole.create({name: 'client'}, (err, role) => {
                    if (err) reject(err);
                    resolve(role);
                });
            });
        })
        .then((role) => {
            clientRoleId = role.id;
            // Create a user and associate it to the client role
            return Helper.createUser(clientCreds, {name: 'client'});
        })
        .then((clientUser) => {
            clientId = clientUser.id;
            // Log client in
            return Helper.login(clientCreds);
        })
        .then((tokenId) => {
            clientToken = tokenId;
        });
    });

    beforeEach(function () {
        return Helper.cleanAllAtomicFeeds(adminToken, {force: true});
    });

    after(function () {
        return Helper.cleanAllAtomicFeeds(adminToken, {force: true})
        .then(() => Helper.removeUser(clientId, clientToken))
        .then(() => Helper.removeUser(adminId, adminToken))
        .then(() => {
            return new Promise((resolve, reject) => {
                app.models.HubRole.destroyById(clientRoleId, function (err) {
                    if (err) reject(err);
                    resolve();
                });
            });
        });
    });

    var insertFeedRoleAcl = function (token, options) {
        return new Promise((resolve, reject) => {
            request(app)
            .post(`/api/feeds/${options.feedType}/${options.feedId}/role-acl`)
            .set('Authorization', token)
            .type('json')
            .send(JSON.stringify({roleId: options.roleId}))
            .expect(200, (err, res) => {
                if (err) reject(err);
                resolve(res.body.id);
            });
        });
    };

    describe('Controlling access to feeds for clients', function () {

        it('feed role ACL should be removed when associated feed is deleted', function () {
            return Helper.insertValidAtomicFeed(adminToken)
            .then((args) => {
                var atomicId = args[0];
                return insertFeedRoleAcl(adminToken, {
                    feedType: 'atomic',
                    feedId: atomicId,
                    roleId: clientRoleId
                });
            })
            .then(() => Helper.cleanAllAtomicFeeds(adminToken, {force: true}))
            .then(() => app.models.FeedRoleACL.find())
            .then((acls) => {
                expect(acls).to.have.length(0);
            });
        });

        it('should be forbidden for non authenticated users', function (done) {
            request(app)
            .get('/api/feeds')
            .expect(401, done);
        });

        it('not allowed user shouldn\'t be able to access a feed', function () {
            return Helper.insertValidAtomicFeed(adminToken)
            .then((args) => {
                var atomicId = args[0];
                return new Promise((resolve, reject) => {
                    request(app)
                    .get(`/api/feeds/atomic/filtered/${atomicId}`)
                    .set('Authorization', clientToken)
                    .expect(404, (err, res) => {
                        if (err) reject(err);
                        resolve();
                    });
                });
            });
        });

        it('users should see only the feeds that they are allowed to access', function () {
            return Helper.insertValidAtomicFeed(adminToken)
            .then(() => Helper.insertValidAtomicFeed(adminToken))
            .then((clientArgs) => {
                var clientAtomicId = clientArgs[0];
                return insertFeedRoleAcl(adminToken, {
                    feedType: 'atomic',
                    feedId: clientAtomicId,
                    roleId: clientRoleId
                })
                .then(() => Helper.validateFeed(adminToken, {feedType: 'atomic', id: clientAtomicId}));
            })
            .then(() => {
                return new Promise((resolve, reject) => {
                    request(app)
                    .get('/api/feeds/atomic/filtered/count')
                    .set('Authorization', clientToken)
                    .expect(200, (err, res) => {
                        if (err) reject(err);
                        expect(res.body.count).to.equal(1);
                        resolve(res.body.count);
                    });
                });
            });
        });

        it('allowed user should be able to access a validated feed', function () {
            return Helper.insertValidAtomicFeed(adminToken)
            .then((args) => {
                var atomicId = args[0];
                return insertFeedRoleAcl(adminToken, {
                    feedType: 'atomic',
                    feedId: atomicId,
                    roleId: clientRoleId
                })
                .then(() => Helper.validateFeed(adminToken, {feedType: 'atomic', id: atomicId}))
                .then(() => Helper.getFeedsOfType(clientToken, 'atomic', {id: atomicId, filtered: true}));
            });
        });

        it('allowed user should not be able to access a non-validated feed', function () {
            return Helper.insertValidAtomicFeed(adminToken)
            .then((args) => {
                var atomicId = args[0];
                return insertFeedRoleAcl(adminToken, {
                    feedType: 'atomic',
                    feedId: atomicId,
                    roleId: clientRoleId
                })
                .then(() => {
                    return new Promise((resolve, reject) => {
                        request(app)
                        .get(`/api/feeds/atomic/filtered/${atomicId}`)
                        .set('Authorization', clientToken)
                        .expect(404, (err, res) => {
                            if (err) reject(err);
                            resolve(res.body);
                        });
                    });
                });
            });
        });

    });

    describe('Feed validation', function () {

        it('feed validation property should be hidden', function () {
            return Helper.insertValidAtomicFeed(adminToken)
            .then((args) => {
                var atomicId = args[0];
                return Helper.getFeedsOfType(adminToken, 'atomic', {id: atomicId});
            })
            .then((atomic) => {
                expect(atomic.validated).to.not.exist;
            });
        });

        it('a feed should be not validated by default', function () {
            return Helper.insertValidAtomicFeed(adminToken)
            .then((args) => {
                var atomicId = args[0];
                return app.models.AtomicFeed.findById(atomicId);
            })
            .then((atomic) => {
                expect(atomic.validated).to.exist;
                expect(atomic.validated).to.equal(false);
            });
        });

        it('a feed should be forced to be not validated', function () {
            return Helper.insertValidAtomicFeed(adminToken, {validated: true})
            .then((args) => {
                var atomicId = args[0];
                return app.models.AtomicFeed.findById(atomicId);
            })
            .then((atomic) => {
                expect(atomic.validated).to.exist;
                expect(atomic.validated).to.equal(false);
            });
        });

        it('validating feed should create a data collection', function () {
            return Helper.insertValidAtomicFeed(adminToken)
            .then((args) => {
                var atomicId = args[0];
                return Helper.validateFeed(adminToken, {feedType: 'atomic', id: atomicId})
                .then(() => {
                    expect(app.models[`AtomicFeedData${atomicId}`]).to.exist;
                });
            });
        });

        it('each feed\'s field should have a distinct name', function () {
            return Helper.insertValidComposedFeed(adminToken)
            .then((args) => {
                var composedId = args[0];
                // insert two fields with same name
                return Helper.insertValidField(adminToken, {
                    feedType: 'composed',
                    id: composedId,
                    fieldProperty: 'fields'
                }, {name: 'aFieldName'})
                .then(() => {
                    return Helper.insertValidField(adminToken, {
                        feedType: 'composed',
                        id: composedId,
                        fieldProperty: 'fields'
                    }, {name: 'aFieldName'});
                })
                .then(() => {
                    return new Promise((resolve, reject) => {
                        request(app)
                        .post(`/api/feeds/composed/${composedId}/validate`)
                        .set('Authorization', adminToken)
                        .expect(422, (err, res) => {
                            if (err) reject(err);
                            resolve(res.body);
                        });
                    });
                });
            });
        });

        it('modifying a validated feed is allowed', function () {
            return Helper.insertValidAtomicFeed(adminToken)
            .then((args) => {
                var atomicId = args[0];
                return Helper.validateFeed(adminToken, {feedType: 'atomic', id: atomicId})
                .then(() => {
                    return new Promise((resolve, reject) => {
                        request(app)
                        .put(`/api/feeds/atomic/${atomicId}`)
                        .set('Authorization', adminToken)
                        .type('json')
                        .send(JSON.stringify({name: 'newFeedName'}))
                        .expect(200, (err, res) => {
                            if (err) reject(err);
                            resolve(res.body);
                        });
                    });
                })
                .then(() => Helper.getFeedsOfType(adminToken, 'atomic', {id: atomicId}))
                .then((atomic) => {
                    expect(atomic.name).to.equal('newFeedName');
                });
            });
        });

        it('modifying a validated feed\'s fields is forbidden', function () {
            return Helper.insertValidAtomicFeed(adminToken)
            .then((args) => {
                var atomicId = args[0];
                return Helper.validateFeed(adminToken, {feedType: 'atomic', id: atomicId})
                .then(() => {
                    return new Promise((resolve, reject) => {
                        request(app)
                        .put(`/api/feeds/atomic/${atomicId}/field`)
                        .set('Authorization', adminToken)
                        .type('json')
                        .send(JSON.stringify({name: 'newFieldName'}))
                        .expect(401, (err, res) => {
                            if (err) reject(err);
                            resolve(res.body);
                        });
                    });
                });
            });
        });

        // TODO: find how to make this test pass
        xit('force-deleting a validated feed should delete associated data collection', function () {
            return Helper.insertValidAtomicFeed(adminToken)
            .then((args) => {
                var atomicId = args[0];
                return Helper.validateFeed(adminToken, {feedType: 'atomic', id: atomicId})
                .then(() => Helper.deleteFeed(adminToken, {type: 'atomic', id: atomicId, force: true}))
                .then(() => {
                    expect(app.models[`AtomicFeedData${atomicId}`]).to.not.exist;
                });
            });
        });

        it('deleting a validated feed should be forbidden', function () {
            return Helper.insertValidAtomicFeed(adminToken)
            .then((args) => {
                var atomicId = args[0];
                return Helper.validateFeed(adminToken, {feedType: 'atomic', id: atomicId})
                .then(() => {
                    return new Promise((resolve, reject) => {
                        request(app)
                        .delete(`/api/feeds/atomic/${atomicId}`)
                        .set('Authorization', adminToken)
                        .expect(422, (err, res) => {
                            if (err) reject(err);
                            resolve(res.body);
                        });
                    });
                });
            });
        });

    });

    describe('Feed data collection', function () {

        var FieldTypes = require('../field-types');

        var composedId;
        var composedFieldName = 'aRequiredComposedField';
        var composedData = {[composedFieldName]: {unit: 'c', val: 4}};

        beforeEach(function () {
            return Helper.cleanAllComposedFeeds(adminToken, {force: true})
            .then(() => Helper.insertValidComposedFeed(adminToken))
            .then((args) => {
                composedId = args[0];
                return Helper.insertValidField(adminToken, {
                    feedType: 'composed',
                    id: composedId,
                    fieldProperty: 'fields'
                }, {
                    name: composedFieldName,
                    type: FieldTypes.TEMPERATURE,
                    required: true
                })
                .then(() => {
                    return insertFeedRoleAcl(adminToken, {
                        feedType: 'composed',
                        feedId: composedId,
                        roleId: clientRoleId
                    });
                });
            });
        });

        after(function () {
            return Helper.cleanAllComposedFeeds(adminToken, {force: true});
        });

        it('should find previously inserted data', function () {
            return Helper.validateFeed(adminToken, {
                feedType: 'composed',
                id: composedId
            })
            .then(() => {
                return Helper.insertData(clientToken, composedData, {
                    feedType: 'composed',
                    id: composedId
                });
            })
            .then((insertedData) => {
                return Helper.getData(clientToken, {
                    feedType: 'composed',
                    id: composedId
                })
                .then((data) => {
                    expect(data[0]).to.eql(insertedData);
                });
            });
        });

        it('required fields inclusion should be verified in data', function () {
            return Helper.validateFeed(adminToken, {
                feedType: 'composed',
                id: composedId
            })
            .then(() => {
                var validField = Helper.validField();
                var incorrectData = {[validField.name]: {unit: 'c', val: 4}};
                return new Promise((resolve, reject) => {
                    request(app)
                    .post(`/api/feeds/composed/${composedId}/data`)
                    .set('Authorization', clientToken)
                    .type('json')
                    .send(JSON.stringify(incorrectData))
                    .expect(422, (err, res) => {
                        if (err) reject(err);
                        resolve(err);
                    });
                });
            });
        });

        it('complex field types should be validated', function () {
            return Helper.validateFeed(adminToken, {
                feedType: 'composed',
                id: composedId
            })
            .then(() => {
                var validField = Helper.validField();
                var incorrectData = {[composedFieldName]: {unit: 'c', val: 'notANumber'}};
                return new Promise((resolve, reject) => {
                    request(app)
                    .post(`/api/feeds/composed/${composedId}/data`)
                    .set('Authorization', clientToken)
                    .type('json')
                    .send(JSON.stringify(incorrectData))
                    .expect(422, (err, res) => {
                        if (err) reject(err);
                        resolve(err);
                    });
                });
            });
        });

    });

});