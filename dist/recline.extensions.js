// # Recline Backbone Models
this.recline = this.recline || {};
this.recline.Model = this.recline.Model || {};
this.recline.Model.FilteredDataset = this.recline.Model.FilteredDataset || {};


(function ($, my) {

// ## <a id="dataset">VirtualDataset</a>
    my.FilteredDataset = Backbone.Model.extend({
        constructor:function FilteredDataset() {
            Backbone.Model.prototype.constructor.apply(this, arguments);
        },


        initialize:function () {
            var self = this;


            this.records = new my.RecordList();
            this.fields =  this.attributes.dataset.fields;
            this.attributes.deriver = this.attributes.dataset.deriver;

            //todo
            //this.facets = new my.FacetList();
            this.recordCount = null;

            this.queryState = new my.Query();

            if (this.get('initialState')) {
                this.get('initialState').setState(this);
            }

            this.attributes.dataset.fields.bind('reset', function () {
                self.fieldsReset();
            })

            this.attributes.dataset.bind('query:done', function () {
                self.query();
            })

            this.queryState.bind('change', function () {
                self.query();
            });

        },

        fieldsReset: function() {
            this.fields = this.attributes.dataset.fields;

        },

        query:function (queryObj) {
            var self=this;
            this.trigger('query:start');

            if (queryObj) {
                this.queryState.set(queryObj, {silent:true});
            }

            var queryObj = this.queryState.toJSON();

            _.each(self.attributes.customFilterLogic, function (f) {
                f(queryObj);
            });


            //console.log("Query on model query [" + JSON.stringify(queryObj) + "]");

            var dataset = self.attributes.dataset;
            var numRows = queryObj.size || dataset.recordCount;
            var start = queryObj.from || 0;

            //todo use records fitlering in order to inherit all record properties
            //todo perhaps need a new applyfiltersondata
            var results = recline.Data.Filters.applyFiltersOnData(queryObj.filters, dataset.records.toJSON(), dataset.fields.toJSON());

            _.each(queryObj.sort, function (sortObj) {
                var fieldName = sortObj.field;
                results = _.sortBy(results, function (doc) {
                    var _out = doc[fieldName];
                    return _out;
                });
                if (sortObj.order == 'desc') {
                    results.reverse();
                }
            });

            results = results.slice(start, start + numRows);
            self.recordCount = results.length;

            var docs = _.map(results, function (hit) {
                var _doc = new my.Record(hit);
                _doc.fields = dataset.fields;
                _doc.bind('change', function (doc) {
                    self._changes.updates.push(doc.toJSON());
                });
                _doc.bind('destroy', function (doc) {
                    self._changes.deletes.push(doc.toJSON());
                });
                return _doc;
            });

            self.records.reset(docs);

            self.trigger('query:done');
        },

        getRecords:function () {
            return this.records.models;
        },

        getFields:function (type) {
            return this.attributes.dataset.fields;
        },

        toTemplateJSON:function () {
            var data = this.records.toJSON();
            data.recordCount = this.recordCount;
            data.fields = this.fields.toJSON();
            return data;
        },

        getFieldsSummary:function () {
            return this.attributes.dataset.getFieldsSummary();
        },

        addCustomFilterLogic: function(f) {
            if(this.attributes.customFilterLogic)
                this.attributes.customFilterLogic.push(f);
            else
                this.attributes.customFilterLogic = [f];
        },
        setColorSchema:function () {
            var self = this;
            _.each(self.attributes.colorSchema, function (d) {
                var field = _.find(self.fields.models, function (f) {
                    return d.field === f.id
                });
                if (field != null)
                    field.attributes.colorSchema = d.schema;
            })

        }




    })


}(jQuery, this.recline.Model));

// # Recline Backbone Models
this.recline = this.recline || {};
this.recline.Model = this.recline.Model || {};
this.recline.Model.JoinedDataset = this.recline.Model.JoinedDataset || {};


(function ($, my) {

// ## <a id="dataset">VirtualDataset</a>
    my.JoinedDataset = Backbone.Model.extend({
        constructor:function JoinedDataset() {
            Backbone.Model.prototype.constructor.apply(this, arguments);
        },


        initialize:function () {
            var self = this;
            _.bindAll(this, 'generatefields');

            self.ds_fetched = [];
            self.field_fetched = [];

            self.joinedModel = new my.Dataset({backend: "Memory", records:[], fields: [], renderer: self.attributes.renderer});

            self.fields = self.joinedModel.fields;
            self.records = self.joinedModel.records;
            self.facets = self.joinedModel.facets;
            self.recordCount = self.joinedModel.recordCount;
            self.queryState = self.joinedModel.queryState;

            if (this.get('initialState')) {
                this.get('initialState').setState(this);
            }

            this.attributes.model.fields.bind('reset', function() {
                self.field_fetched.push("model");

                if (self.allDsFetched(self.field_fetched))
                    self.generatefields();
            });
            //this.attributes.model.fields.bind('add', this.generatefields);

            _.each(this.attributes.join, function(p) {
                p.model.fields.bind('reset', function() {
                    if(!p.id)
                        throw "joinedmodel: a model without id has been used in join. Unable to apply joined model";

                    self.field_fetched.push(p.model.id);

                    if (self.allDsFetched(self.field_fetched))
                        self.generatefields();

                });
                //p.model.fields.bind('add', self.generatefields);
            });

            this.attributes.model.bind('query:done', function () {
                self.ds_fetched.push("model");


                if (self.allDsFetched(self.ds_fetched))
                    self.query();
            })

            _.each(this.attributes.join, function(p) {

                p.model.bind('query:done', function () {
                    if(!p.id)
                        throw "joinedmodel: a model without id has been used in join. Unable to apply joined model";

                    self.ds_fetched.push(p.id);

                    if (self.allDsFetched(self.ds_fetched))
                        self.query();
                });

                p.model.queryState.bind('change', function () {
                    if (self.allDsFetched(self.ds_fetched))
                        self.query();
                });

            });

        },

        allDsFetched: function(fetchedList) {
            var self=this;
            var ret= true;

            if(!_.contains(fetchedList, "model"))
                return false;

             _.each(self.attributes.join, function(p) {
                 if(!_.contains(fetchedList, p.id)) {
                     ret = false;
                 }
             });


             return ret;
        },

        generatefields:function () {
            var self=this;
            var tmpFields = [];
            _.each(this.attributes.model.fields.models, function (f) {
                var c = f.toJSON();
                c.id = c.id;
                tmpFields.push(c);
            });

            _.each(this.attributes.join, function(p) {
                _.each(p.model.fields.models, function (f) {
                    var c = f.toJSON();
                    c.id = p.id + "_" + c.id;
                    tmpFields.push(c);
                });
            });

            this.joinedModel.resetFields(tmpFields);

        },



        query:function (queryObj) {
            var self=this;
            self.trigger('query:start');
            if (queryObj) {
                this.queryState.set(queryObj, {silent:true});
            }
            var results = self.join();

            self.joinedModel.resetRecords(results);
            if(self.fields.models.length == 0)
                self.generatefields();

            self.joinedModel.fetch();
            self.recordCount = self.joinedModel.recordCount;


            self.trigger('query:done');
        },

        join:function () {

            var joinType = this.attributes.joinType;
            var model = this.attributes.model;
            var joinModel = this.attributes.join;


            var results = [];

            _.each(model.getRecords(), function (r) {
                var filters = [];
                // creation of a filter on dataset2 based on dataset1 field value of joinon field


                var recordMustBeAdded = true;

                // define the record with all data from model
                var record = {};
                _.each(r.toJSON(), function (f, index) {
                    record[index] = f;
                });

                _.each(joinModel, function(p) {
                    // retrieve records from secondary model
                    _.each(p.joinon, function (f) {
                        var field = p.model.fields.get(f);
                        if(!field)
                            throw "joinedmodel.js: unable to find field [" + f + "] on secondary model";

                        filters.push({field:field.id, type:"term", term: r.getFieldValueUnrendered(field), fieldType:field.attributes.type });
                    })

                    var resultsFromDataset2 = recline.Data.Filters.applyFiltersOnData(filters, p.model.records.toJSON(), p.model.fields.toJSON());

                    if(resultsFromDataset2.length == 0)
                        recordMustBeAdded = false;

                    _.each(resultsFromDataset2, function (res) {
                        _.each(res, function (field_value, index) {
                            record[p.id + "_" + index] = field_value;
                        })
                    })

                });

               if(joinType=="left" || recordMustBeAdded)
                    results.push(record);

            })


            return results;
        },

        addCustomFilterLogic: function(f) {
            return this.joinedModel.addCustomFilterLogic(f);
        },

        getRecords:function (type) {
            return this.joinedModel.getRecords(type);
        },

        getFields:function (type) {
            return this.joinedModel.getFields(type);
        },

        toTemplateJSON:function () {
            return this.joinedModel.toTemplateJSON();
        },


        getFacetByFieldId:function (fieldId) {
            return this.joinedModel.getFacetByFieldId(fieldId);
        },

        isFieldPartitioned:function (field) {
            return false
        },
        toFullJSON:function (resultType) {
            return this.joinedModel.toFullJSON(resultType);
        },
        setColorSchema:function () {
            if(this.attributes["colorSchema"])
                this.joinedModel.attributes["colorSchema"] = this.attributes["colorSchema"];
            return this.joinedModel.setColorSchema();
        },
        // a color schema is linked to the dataset but colors are not recalculated upon data/field reset
        addStaticColorSchema: function(colorSchema, field) {
            var self = this;
            if (!self.attributes["colorSchema"])
                self.attributes["colorSchema"] = [];

            self.attributes["colorSchema"].push({schema:colorSchema, field:field});
            this.joinedModel.attributes["colorSchema"] = this.attributes["colorSchema"];

            self.setColorSchema();

            self.fields.bind('reset', function () {
                self.setColorSchema();
            });
            self.fields.bind('add', function () {
                self.setColorSchema();
            });

        }


    })


}(jQuery, this.recline.Model));

recline.Model.Query.prototype = $.extend(recline.Model.Query.prototype, {
    defaults: function() {
        return {
            size: 500000    ,
            from: 0,
            q: '',
            facets: {},
            filters: []
        };
    }
});
(function ($) {

    recline.Model.Dataset.prototype = $.extend(recline.Model.Dataset.prototype, {
        setColorSchema:function () {
            var self = this;
            _.each(self.attributes.colorSchema, function (d) {
                var field = _.find(self.fields.models, function (f) {
                    return d.field === f.id
                });
                if (field != null)
                    field.attributes.colorSchema = d.schema;
            })

        },

        // a color schema is linked to the dataset but colors are not recalculated upon data/field reset
        addStaticColorSchema: function(colorSchema, field) {
            var self = this;
            if (!self.attributes["colorSchema"])
                self.attributes["colorSchema"] = [];

            self.attributes["colorSchema"].push({schema:colorSchema, field:field});

            if(self.fields.length > 0)
                self.setColorSchema();

            self.fields.bind('reset', function () {
                self.setColorSchema();
            });
            self.fields.bind('add', function () {
                self.setColorSchema();
            });
            self.fields.bind('change', function () {
                self.setColorSchema();
            });

        },

        _handleQueryResult:function () {
            var super_init = recline.Model.Dataset.prototype._handleQueryResult;

            return function (queryResult) {
                //console.log("-----> " + this.id +  " HQR colors");
                var self = this;

                if (queryResult.facets) {
                    _.each(queryResult.facets, function (f, index) {
                        recline.Data.ColorSchema.addColorsToTerms(f.id, f.terms, self.attributes.colorSchema);
                    });

                    return super_init.call(this, queryResult);

                }
            };
        }()
    });


    recline.Model.Record.prototype = $.extend(recline.Model.Record.prototype, {
        getFieldColor:function (field) {
            if (!field.attributes.colorSchema)
                return null;

            if (field.attributes.is_partitioned) {
                return field.attributes.colorSchema.getTwoDimensionalColor(field.attributes.partitionValue, this.getFieldValueUnrendered(field));
            }
            else
                return field.attributes.colorSchema.getColorFor(this.getFieldValueUnrendered(field));

        }
    });


    recline.Model.Field.prototype = $.extend(recline.Model.Field.prototype, {

        getColorForPartition:function () {

            if (!this.attributes.colorSchema)
                return null;

            if (this.attributes.is_partitioned)
                return this.attributes.colorSchema.getColorFor(this.attributes.partitionValue);

            return this.attributes.colorSchema.getColorFor(this.attributes.id);
        }
    });


}(jQuery));(function ($) {

    recline.Model.Dataset.prototype = $.extend(recline.Model.Dataset.prototype, {
            addCustomFilterLogic: function(f) {
            if(this.attributes.customFilterLogic)
                this.attributes.customFilterLogic.push(f);
            else
                this.attributes.customFilterLogic = [f];
        }
    });


}(jQuery));recline.Model.Dataset.prototype = $.extend(recline.Model.Dataset.prototype, {
    /*fetch:function () {
        var super_init = recline.Model.Dataset.prototype.fetch;
        return function () {
            super_init.call(this);
            var self = this;
            if (self.attributes.renderer) {

                _.each(self.fields.models, function (f) {
                    f.renderer = self.attributes.renderer;
                });

            }
            ;


        }
    }()*/


    initialize:function () {
        var super_init = recline.Model.Dataset.prototype.initialize;
        return function () {
            super_init.call(this);
            _.bindAll(this, 'applyRendererToFields');

            this.fields.bind('reset', this.applyRendererToFields());
        };
    }(),

    applyRendererToFields: function() {
        var self = this;
        if (self.attributes.renderer) {
            _.each(self.fields.models, function (f) {
                f.renderer = self.attributes.renderer;
            });
        }

    }



});
(function ($) {
    recline.Model.Dataset.prototype = $.extend(recline.Model.Dataset.prototype, {


        getFacetByFieldId:function (fieldId) {
            return _.find(this.facets.models, function (facet) {
                return facet.id == fieldId;
            });
        }

    });







}(jQuery));

recline.Model.Query.prototype = $.extend(recline.Model.Query.prototype, {
    addFacetNoEvent:function (fieldId) {
        var facets = this.get('facets');
        // Assume id and fieldId should be the same (TODO: this need not be true if we want to add two different type of facets on same field)
        if (_.contains(_.keys(facets), fieldId)) {
            return;
        }
        facets[fieldId] = {
            terms:{ field:fieldId }
        };
        this.set({facets:facets}, {silent:true});

    }

});recline.Model.Dataset.prototype = $.extend(recline.Model.Dataset.prototype, {
    toFullJSON:function (resultType) {
        var self = this;
        return _.map(self.getRecords(resultType), function (r) {
            var res = {};

            _.each(self.getFields(resultType).models, function (f) {
                res[f.id] = r.getFieldValueUnrendered(f);
            });

            return res;

        });
    },
    resetRecords:function (records) {
        this.set({records:records}, {silent:true});
    },
    resetFields:function (fields) {
        this.set({fields:fields}, {silent: true});
    },

    getRecords:function (type) {
        var self = this;

        
        
        if (type === 'filtered' || type == null) {
            return self.records.models;
        } else {
            if (self._store.data == null) {
                throw "Model: unable to retrieve not filtered data, store can't provide data. Use a backend that use a memory store";
            }

            if (self.queryState.get('sort') && self.queryState.get('sort').length > 0) {
                _.each(self.queryState.get('sort'), function (sortObj) {
                    var fieldName = sortObj.field;
                    self._store.data = _.sortBy(self._store.data, function (doc) {
                        var _out = doc[fieldName];
                        return _out;
                    });
                    if (sortObj.order == 'desc' && typeof sortObj.alreadySorted == "undefined") {
                        self._store.data.reverse();
                        sortObj.alreadySorted = true;
                    }
                });
            }

            var docs = _.map(self._store.data, function (hit) {
                var _doc = new recline.Model.Record(hit);
                _doc.fields = self.fields;
                return _doc;
            });
            
            if (self.queryState.getSelections().length > 0)
                recline.Data.Filters.applySelectionsOnRecord(self.queryState.get('selections'), docs, self.fields);

           


            return docs;
        }
    },

    getFields:function (type) {
        var self = this;
        return self.fields;

    },

    _normalizeRecordsAndFields:function () {
        var super_init = recline.Model.Dataset.prototype._normalizeRecordsAndFields;
        return function (records, fields) {
            var self=this;
            var out = super_init.call(this, records, fields);
            recline.Data.FieldsUtility.setFieldsAttributes(out.fields, self);
            return out;
        };
    }(),
    
    _handleQueryResult:function () {
        var super_init = recline.Model.Dataset.prototype._handleQueryResult;

        return function (queryResult) {
            //console.log("-----> " + this.id +  " HQR generic");

            var self=this;
            if (queryResult.fields && self.fields.length == 0) {

                recline.Data.FieldsUtility.setFieldsAttributes(queryResult.fields, self);
                var options;
                if (self.attributes.renderer)
                  options = { renderer: self.attributes.renderer};


                self.fields.reset(queryResult.fields, options);

            }

            return super_init.call(this, queryResult);

        };
    }()


});


recline.Model.Dataset.prototype = $.extend(recline.Model.Dataset.prototype, {
    query:function (queryObj) {
        var super_init = recline.Model.Dataset.prototype.query;

        return function (queryObj) {
            var self = this;

            if (queryObj) {
                this.queryState.set(queryObj, {silent:true});
            }
            var actualQuery = this.queryState.toJSON();

            var modified = false;
            // add possibility to modify filter externally before execution
            _.each(self.attributes.customFilterLogic, function (f) {
                f(actualQuery);
                modified = true;
            });

            //console.log("Query on model [" + (self.attributes.id ? self.attributes.id : "") + "] query [" + JSON.stringify(actualQuery) + "]");

            if (queryObj || modified)
                return super_init.call(this, actualQuery);
            else
                return super_init.call(this, queryObj);


        };
    }()
});

recline.Model.Query.prototype = $.extend(recline.Model.Query.prototype, {
    removeFilterByFieldNoEvent:function (field) {
        var filters = this.get('filters');
        for (var j in filters) {
            if (filters[j].field === field) {
                filters.splice(j, 1);
                this.set({filters:filters}, {silent: true});
            }
        }
    },
    getFilterByFieldName:function (fieldName) {
        var res = _.find(this.get('filters'), function (f) {
            return f.field == fieldName;
        });
        if (res == -1)
            return null;
        else
            return res;

    },


    // update or add the selected filter(s), a change event is not triggered after the update

    setFilter:function (filter) {
        if (filter["remove"]) {
            this.removeFilterByFieldNoEvent(filter.field);
            delete filter["remove"];
        } else {

            var filters = this.get('filters');
            var found = false;
            for (var j = 0; j < filters.length; j++) {
                if (filters[j].field == filter.field) {
                    filters[j] = filter;
                    found = true;
                }
            }
            if (!found)
                filters.push(filter);
        }
    },


    removeFilterByField:function (field) {
        var filters = this.get('filters');
        for (var j in filters) {
            if (filters[j].field == field) {
                this.removeFilter(j);
            }
        }
    },


    clearFilter:function (field) {
        var filters = this.get('filters');
        for (var j in filters) {
            if (filters[j].field == field) {
                filters[j].term = null;
                filters[j].start = null;
                filters[j].stop = null;
                break;
            }
        }
    },

    addSortCondition:function (field, order) {
        var currentSort = this.get("sort");
        if (!currentSort)
            currentSort = [
                {field:field, order:order}
            ];
        else
            currentSort.push({field:field, order:order});

        this.attributes["sort"] = currentSort;

        this.trigger('change:filters:sort');

    },

    setSortCondition:function (sortCondition) {
        var currentSort = this.get("sort");
        if (!currentSort)
            currentSort = [sortCondition];
        else
            currentSort.push(sortCondition);

        this.attributes["sort"] = currentSort;

    },

    clearSortCondition:function () {
        this.attributes["sort"] = null;
    }




});recline.Model.Dataset.prototype = $.extend(recline.Model.Dataset.prototype, {
    selection:function (queryObj) {
        var self = this;

        this.trigger('selection:start');

        if (queryObj) {
            self.queryState.set(queryObj, {silent:true});
        }
        var actualQuery = self.queryState

        recline.Data.Filters.applySelectionsOnRecord(self.queryState.getSelections(), self.records.models, self.fields);

        self.queryState.trigger('selection:done');
    },
    initialize:function () {
        var super_init = recline.Model.Dataset.prototype.initialize;
        return function () {
            super_init.call(this);
            _.bindAll(this, 'selection');
            _.bindAll(this, 'applySelectionOnRecords');

            this.queryState.bind('selection:change', this.selection);
            this.records.bind('reset', this.applySelectionOnRecords());
        };
    }(),
    applySelectionOnRecords: function() {
    	var self = this;
    	if (this.queryState && this.queryState.getSelections().lenght > 0)
    		recline.Data.Filters.applySelectionsOnRecord(self.queryState.getSelections(), self.records.models, self.fields);

    }
});


recline.Model.Record.prototype = $.extend(recline.Model.Record.prototype, {
    isRecordSelected:function () {
        var self = this;
        return self["is_selected"];
    },
    setRecordSelection:function (sel) {
        var self = this;
        self["is_selected"] = sel;
    }
});


recline.Model.Query.prototype = $.extend(recline.Model.Query.prototype, {
    getSelections:function () {
        var sel = this.get('selections');
        if (sel)
            return sel;


        this.set({selections:[]}, {silent: true});
        return this.get('selections');

    },

    getSelectionByFieldName:function (fieldName) {
        var res = _.find(this.get('selections'), function (f) {
            return f.field == fieldName;
        });
        if (res == -1)
            return null;
        else
            return res;

    },

// ### addSelection
//
// Add a new selection (appended to the list of selections)
//
// @param selection an object specifying the filter - see _filterTemplates for examples. If only type is provided will generate a filter by cloning _filterTemplates
    addSelection:function (selection) {
        // crude deep copy
        var myselection = JSON.parse(JSON.stringify(selection));
        // not full specified so use template and over-write
        // 3 as for 'type', 'field' and 'fieldType'
        if (_.keys(selection).length <= 3) {
            myselection = _.extend(this._selectionTemplates[selection.type], myselection);
        }
        var selections = this.getSelections();
        selections.push(myselection);
        this.trigger('selection:change');
    },


// ### removeSelection
//
// Remove a selection at index selectionIndex
    removeSelection:function (selectionIndex) {
        var selections = this.getSelections();
        selections.splice(selectionIndex, 1);
        this.set({selections:selections}, {silent: true});
        this.trigger('selection:change');
    },
    removeSelectionByField:function (field) {
        var selections = this.getSelections();
        for (var j in selections) {
            if (selections[j].field == field) {
                this.removeSelection(j);
            }
        }
    },
    setSelection:function (filter) {
    	
        if (filter["remove"]) {
            this.removeSelectionByField(filter.field);
            delete filter["remove"];
        } else {
            var s = this.getSelections();
            var found = false;
            for (var j = 0; j < s.length; j++) {
                if (s[j].field == filter.field) {
                    s[j] = filter;
                    found = true;
                }
            }
            if (!found)
                s.push(filter);
        }
        this.trigger('selection:change');
    },

    isSelected:function () {
        return this.getSelections().length > 0;
    }

});
recline.Model.Dataset.prototype = $.extend(recline.Model.Dataset.prototype, {
    setShapeSchema:function () {
        var self = this;
        _.each(self.attributes.shapeSchema, function (d) {
            var field = _.find(self.fields.models, function (f) {
                return d.field === f.id
            });
            if (field != null)
                field.attributes.shapeSchema = d.schema;
        })
    },

    _handleQueryResult:function () {
        var super_init = recline.Model.Dataset.prototype._handleQueryResult;

        return function (queryResult) {

            //console.log("-----> " + this.id +  " HQR shapes");

            var self = this;

            if (queryResult.facets) {
                _.each(queryResult.facets, function (f, index) {
                    recline.Data.ShapeSchema.addShapesToTerms(f.id, f.terms, self.attributes.shapeSchema)
                });

                return super_init.call(this, queryResult);

            }
        };
    }()

});


recline.Model.Record.prototype = $.extend(recline.Model.Record.prototype, {
    getFieldShapeName:function (field) {
        if (!field.attributes.shapeSchema)
            return null;

        if (field.attributes.is_partitioned) {
            return field.attributes.shapeSchema.getShapeNameFor(field.attributes.partitionValue);
        }
        else
            return field.attributes.shapeSchema.getShapeNameFor(this.getFieldValueUnrendered(field));

    },

    getFieldShape:function (field, isSVG, isNode) {
        if (!field.attributes.shapeSchema)
            return recline.Template.Shapes["empty"](null, isNode, isSVG);

        var fieldValue;
        var fieldColor = this.getFieldColor(field);

        if (field.attributes.is_partitioned) {
            fieldValue = field.attributes.partitionValue;
        }
        else
            fieldValue = this.getFieldValueUnrendered(field);


        return field.attributes.shapeSchema.getShapeFor(fieldValue, fieldColor, isSVG, isNode);
    }
});

recline.Model.Dataset.prototype = $.extend(recline.Model.Dataset.prototype, {

    initialize: function () {
        var super_init = recline.Model.Dataset.prototype.initialize;
        return function(){
            super_init.call(this);

            if (this.get('initialState')) {
                this.get('initialState').setState(this);
            }

        };
    }()



});

// # Recline Backbone Models
this.recline = this.recline || {};
this.recline.Model = this.recline.Model || {};
this.recline.Model.UnionDataset = this.recline.Model.UnionDataset || {};


(function ($, my) {

// ## <a id="dataset">VirtualDataset</a>
    my.UnionDataset = Backbone.Model.extend({
        constructor:function UnionDataset() {
            Backbone.Model.prototype.constructor.apply(this, arguments);
        },


        initialize:function () {
            var self = this;
            _.bindAll(this, 'generateFields');

            self.ds_fetched = [];

            self.unionModel = new my.Dataset({backend: "Memory", records:[], fields: [], renderer: self.attributes.renderer});

            self.fields = self.unionModel.fields;
            self.records = self.unionModel.records;
            self.facets = self.unionModel.facets;
            self.recordCount = self.unionModel.recordCount;
            self.queryState = self.unionModel.queryState;

            if (this.get('initialState')) {
                this.get('initialState').setState(this);
            }

            this.attributes.model.fields.bind('reset', this.generateFields);
            this.attributes.model.fields.bind('add', this.generateFields);

            _.each(this.attributes.union, function(p) {
                p.model.fields.bind('reset', self.generateFields);
                p.model.fields.bind('add', self.generateFields);
            });

            if(self.attributes.model.recordCount > 0)
                self.ds_fetched.push("model");

            this.attributes.model.bind('query:done', function () {
                self.ds_fetched.push("model");

                if (self.allDsFetched())
                    self.query();
            })

            _.each(this.attributes.union, function(p) {

                p.model.bind('query:done', function () {
                    self.ds_fetched.push(p.id);

                    if (self.allDsFetched())
                        self.query();
                });

                if(p.model.recordCount > 0)
                    self.ds_fetched.push(p.id);

                p.model.queryState.bind('change', function () {
                    if (self.allDsFetched())
                        self.query();
                });

            });

            if (self.allDsFetched()) {
                self.generateFields();
                self.query();

            }

        },

        allDsFetched: function() {
            var self=this;
            var ret= true;

            if(!_.contains(self.ds_fetched, "model"))
                return false;

             _.each(self.attributes.union, function(p) {
                 if(!_.contains(self.ds_fetched, p.id)) {
                     ret = false;
                 }
             });

             return ret;
        },

        generateFields:function () {
            var self=this;

            var tmpFields = [];
            var derivedFields = [];

            _.each(this.attributes.model.fields.models, function (f) {
                tmpFields.push(f.toJSON());

            });

            _.each(this.attributes.union, function(p) {
                _.each(p.model.fields.models, function (f) {
                    if(!_.find(tmpFields, function(r) { return r.id==f.id; } ))
                    tmpFields.push(f.toJSON());

                });
            });


            this.unionModel.resetFields(tmpFields);


        },



        query:function (queryObj) {
            var self=this;
            self.trigger('query:start');
            if (queryObj) {
                this.queryState.set(queryObj, {silent:true});
            }
            var results = self.union();

            self.unionModel.resetRecords(results);
            self.unionModel.fetch();
            self.recordCount = self.unionModel.recordCount;

            self.trigger('query:done');
        },

        union:function () {

            var model = this.attributes.model;
            var unionModel = this.attributes.union;


            var results = [];
            // derived fields are copyed by value
            //var derivedFieldsModel = _.filter(model.fields.models, function(f) { return f.deriver });

            _.each(model.records.toJSON(), function (r) {

                //_.each(derivedFieldsModel, function(f) {
                   // rec[f.id] = r.getFieldValue(f);
                //})

               results.push(r);
            });

            _.each(unionModel, function(p) {
                //var derivedFieldsUnion = _.filter(p.model.fields.models, function(f) { return f.deriver });

                _.each(p.model.records.toJSON(), function (r) {

                    //_.each(derivedFieldsUnion, function(f) {
                       // rec[f.id] = r.getFieldValue(f);
                    //})

                    results.push(r);
                });
            });

            return results;
        },

        addCustomFilterLogic: function(f) {
            return this.unionModel.addCustomFilterLogic(f);
        },

        getRecords:function (type) {
            return this.unionModel.getRecords(type);
        },

        getFields:function (type) {
            return this.unionModel.getFields(type);
        },

        toTemplateJSON:function () {
            return this.unionModel.toTemplateJSON();
        },


        getFacetByFieldId:function (fieldId) {
            return this.unionModel.getFacetByFieldId(fieldId);
        },

        isFieldPartitioned:function (field) {
            return false
        },
        toFullJSON:function (resultType) {
            return this.unionModel.toFullJSON(resultType);
        },
        setColorSchema:function () {
            if(this.attributes["colorSchema"])
                this.unionModel.attributes["colorSchema"] = this.attributes["colorSchema"];
            return this.unionModel.setColorSchema();
        }

    })


}(jQuery, this.recline.Model));

// # Recline Backbone Models
this.recline = this.recline || {};
this.recline.Model = this.recline.Model || {};
this.recline.Model.VirtualDataset = this.recline.Model.VirtualDataset || {};


(function ($, my) {

// ## <a id="dataset">VirtualDataset</a>
    my.VirtualDataset = Backbone.Model.extend({
        constructor:function VirtualDataset() {
            Backbone.Model.prototype.constructor.apply(this, arguments);
        },


        initialize:function () {
            _.bindAll(this, 'query');


            var self = this;

            self.vModel = new my.Dataset(
                {
                    backend: "Memory",
                    records:[], fields: [],
                    renderer: self.attributes.renderer});


            self.fields = self.vModel.fields;
            self.records = self.vModel.records;
            self.facets = self.vModel.facets;
            self.recordCount = self.vModel.recordCount;
            self.queryState = self.vModel.queryState;

            if (this.get('initialState')) {
                this.get('initialState').setState(this);
            }

            this.attributes.dataset.bind('query:done', function () {
                self.initializeCrossfilter();
            })

            this.queryState.bind('change', function () {
                self.query();
            });
            this.queryState.bind('selection:change', function () {
                self.selection();
            });

            // dataset is already been fetched
            if (this.attributes.dataset.records.models.length > 0)
                self.initializeCrossfilter();

            // TODO verify if is better to use a new backend (crossfilter) to manage grouping and filtering instead of using it inside the model
            // TODO OPTIMIZATION use a structure for the reduce function that doesn't need any translation to records/arrays
            // TODO USE crossfilter as backend memory
        },

            getRecords:function (type) {
            var self = this;

            if (type === 'totals') {
                if(self.needsTableCalculation && self.totals == null)
                    self.rebuildTotals();
                return self.totals.records.models;
            } else if (type === 'totals_unfiltered') {

                if(self.totals_unfiltered == null)
                    self.rebuildUnfilteredTotals();

                return self.totals_unfiltered.records.models;
            } else {
            	if(self.needsTableCalculation && self.totals == null)
                    self.rebuildTotals();
            	
                return self.vModel.getRecords(type);
            }
        },

        getField_byAggregationFunction: function(resultType, fieldName, aggr) {
            var fields = this.getFields(resultType);
            return fields.get(fieldName + "_" + aggr);
        },


        getFields:function (type) {
            var self = this;

            if (type === 'totals') {
                if(self.totals == null)
                    self.rebuildTotals();

                return self.totals.fields;
            } else if (type === 'totals_unfiltered') {
                if(self.totals == null)
                    self.rebuildUnfilteredTotals();

                return self.totals_unfiltered.fields;
            } else {
                return self.vModel.getFields(type);
            }
        },

        fetch: function() {
            this.initializeCrossfilter();
        },

        initializeCrossfilter:function () {
            var aggregatedFields = this.attributes.aggregation.measures;
            var aggregationFunctions = this.attributes.aggregation.aggregationFunctions;
            var originalFields = this.attributes.dataset.fields;
            var dimensions =  this.attributes.aggregation.dimensions;
            var partitions =this.attributes.aggregation.partitions;

            var crossfilterData = crossfilter(this.attributes.dataset.toFullJSON());
            var group = this.createDimensions(crossfilterData, dimensions);
            var results = this.reduce(group,dimensions,aggregatedFields,aggregationFunctions,partitions);



            this.updateStore(results, originalFields,dimensions,aggregationFunctions,aggregatedFields,partitions);
        },

        setDimensions:function (dimensions) {
            this.attributes.aggregation.dimensions = dimensions;
            this.trigger('dimensions:change');
        },

        setMeasures:function (measures) {
            this.attributes.aggregation.measures = measures;
            this.trigger('measures:change');
        },

        setTotalsMeasures: function(measures) {
            this.attributes.totals.measures = measures;
            this.trigger('totals:change');
        },

        getDimensions:function () {
            return this.attributes.aggregation.dimensions;
        },

        createDimensions:function (crossfilterData, dimensions) {
            var group;

            if (dimensions == null) {
                // need to evaluate aggregation function on all records
                group = crossfilterData.groupAll();
            }
            else {
                var by_dimension = crossfilterData.dimension(function (d) {
                    var tmp = "";
                    for (i = 0; i < dimensions.length; i++) {
                        if (i > 0) {
                            tmp = tmp + "#";
                        }

                        tmp = tmp + d[dimensions[i]].valueOf();
                    }
                    return tmp;
                });
                group = by_dimension.group();
            }

            return group;
        },

        reduce:function (group, dimensions, aggregatedFields, aggregationFunctions, partitions) {

            if (aggregationFunctions == null || aggregationFunctions.length == 0)
                throw("Error aggregationFunctions parameters is not set for virtual dataset ");


            var partitioning = false;
            var partitionFields = {};
            if (partitions != null) {
                var partitioning = true;
            }

            function addFunction(p, v) {
                p.count = p.count + 1;
                for (i = 0; i < aggregatedFields.length; i++) {

                    // for each aggregation function evaluate results
                    for (j = 0; j < aggregationFunctions.length; j++) {
                        var currentAggregationFunction = this.recline.Data.Aggregations.aggregationFunctions[aggregationFunctions[j]];

                        p[aggregationFunctions[j]][aggregatedFields[i]] =
                            currentAggregationFunction(
                                p[aggregationFunctions[j]][aggregatedFields[i]],
                                v[aggregatedFields[i]]);
                    }


                    if (partitioning) {
                        // for each partition need to verify if exist a value of aggregatefield_by_partition_partitionvalue
                        for (x = 0; x < partitions.length; x++) {
                            var partitionName = partitions[x];
                            var partitionValue = v[partitions[x]];
                            var aggregatedField = aggregatedFields[i];
                            var fieldName = aggregatedField + "_by_" + partitionName + "_" + partitionValue;


                            // for each aggregation function evaluate results
                            for (j = 0; j < aggregationFunctions.length; j++) {

                                if (partitionFields[aggregationFunctions[j]] == null)
                                    partitionFields[aggregationFunctions[j]] = {};

                                var currentAggregationFunction = this.recline.Data.Aggregations.aggregationFunctions[aggregationFunctions[j]];

                                if (p.partitions[aggregationFunctions[j]][fieldName] == null) {
                                    p.partitions[aggregationFunctions[j]][fieldName] = {
                                        value:null,
                                        partition:partitionValue,
                                        originalField:aggregatedField,
                                        aggregationFunction:currentAggregationFunction};

                                    // populate partitions description

                                    partitionFields[aggregationFunctions[j]][fieldName] = {
                                        field:partitionName,
                                        value:partitionValue,
                                        originalField:aggregatedField,
                                        aggregationFunction:currentAggregationFunction,
                                        aggregationFunctionName:aggregationFunctions[j],
                                        id:fieldName + "_" + aggregationFunctions[j]
                                    }; // i need partition name but also original field value
                                }
                                p.partitions[aggregationFunctions[j]][fieldName]["value"] =
                                    currentAggregationFunction(
                                        p.partitions[aggregationFunctions[j]][fieldName]["value"],
                                        v[aggregatedFields[i]]);
                            }

                            if (p.partitions.count[fieldName] == null) {
                                p.partitions.count[fieldName] = {
                                    value:1,
                                    partition:partitionValue,
                                    originalField:aggregatedField,
                                    aggregationFunction:"count"
                                };
                            }
                            else
                                p.partitions.count[fieldName]["value"] += 1;
                        }
                    }


                }
                return p;
            }

            function removeFunction(p, v) {
                throw "crossfilter reduce remove function not implemented";
            }

            function initializeFunction() {

                var tmp = {count:0};

                for (j = 0; j < aggregationFunctions.length; j++) {
                    tmp[aggregationFunctions[j]] = {};
                    this.recline.Data.Aggregations.initFunctions[aggregationFunctions[j]](tmp, aggregatedFields, partitions);
                }

                if (partitioning) {
                    tmp["partitions"] = {};
                    tmp["partitions"]["count"] = {};

                    for (j = 0; j < aggregationFunctions.length; j++) {
                        tmp["partitions"][aggregationFunctions[j]] = {};
                    }

                    /*_.each(partitions, function(p){
                     tmp.partitions.list[p] = 0;
                     });*/
                }

                return tmp;
            }

            var reducedGroup = group.reduce(addFunction, removeFunction, initializeFunction);

            var tmpResult;

            if (dimensions == null) {
                tmpResult = [reducedGroup.value()];
            }
            else {
                tmpResult = reducedGroup.all();
            }

            return {reducedResult:tmpResult,
                partitionFields:partitionFields};

        },

        updateStore:function (results, originalFields, dimensions, aggregationFunctions, aggregatedFields, partitions) {
            var self = this;

            var reducedResult = results.reducedResult;
            var partitionFields = results.partitionFields;
            this.partitionFields = partitionFields;

            var fields = self.buildFields(reducedResult, originalFields, partitionFields, dimensions, aggregationFunctions);
            var result = self.buildResult(reducedResult, originalFields, partitionFields, dimensions, aggregationFunctions, aggregatedFields, partitions);

            self.vModel.resetFields(fields);
            self.vModel.resetRecords(result);

            recline.Data.FieldsUtility.setFieldsAttributes(fields, self);

            this.clearUnfilteredTotals();

            self.vModel.fetch();

        },

        rebuildTotals: function() {
            this._rebuildTotals(this.records, this.fields, true);

        },
        rebuildUnfilteredTotals: function() {
            this._rebuildTotals(this._store.data, this.fields, false);
        },
        clearUnfilteredTotals: function() {
            this.totals_unfiltered = null;
           this.clearFilteredTotals();
        },
        clearFilteredTotals: function() {
            this.totals = null;
       },

        _rebuildTotals: function(records, originalFields, filtered) {
            /*
                totals: {
                    aggregationFunctions:["sum"],
                    aggregatedFields: ["fielda"]
                    }
            */
            var self=this;

            if(!self.attributes.totals)
                return;

            var aggregatedFields = self.attributes.totals.measures;
            var aggregationFunctions =  self.attributes.totals.aggregationFunctions;

            var rectmp;

            if(records.constructor == Array)
                rectmp = records;
            else
                rectmp = _.map(records.models, function(d) { return d.attributes;}) ;

            var crossfilterData =  crossfilter(rectmp);

            var group = this.createDimensions(crossfilterData, null);
            var results = this.reduce(group, null,aggregatedFields, aggregationFunctions, null);

            var fields = self.buildFields(results.reducedResult, originalFields, {}, null, aggregationFunctions);
            var result = self.buildResult(results.reducedResult, originalFields, {}, null, aggregationFunctions, aggregatedFields, null);

            // I need to apply table calculations
            var tableCalc = recline.Data.Aggregations.checkTableCalculation(self.attributes.aggregation.aggregationFunctions, self.attributes.totals);

                _.each(tableCalc, function(f) {
                    var p;
                    _.each(rectmp, function(r) {
                        p = recline.Data.Aggregations.tableCalculations[f](self.attributes.aggregation.measures, p, r, result[0]);
                    });
                });

            recline.Data.FieldsUtility.setFieldsAttributes(fields, self);

            var options;
            if (self.attributes.renderer)
                options = { renderer: self.attributes.renderer};

            if(filtered) {
                if(this.totals == null) { this.totals = {records: new my.RecordList(), fields: new my.FieldList() }}

                    this.totals.fields.reset(fields, options) ;
                    this.totals.records.reset(result);
            }   else   {
                if(this.totals_unfiltered == null) { this.totals_unfiltered = {records: new my.RecordList(), fields: new my.FieldList() }}

                    this.totals_unfiltered.fields.reset(fields, options) ;
                    this.totals_unfiltered.records.reset(result);
            }


        },

        needsTableCalculation: function() {
            if(recline.Data.Aggregations.checkTableCalculation(self.attributes.aggregation.aggregationFunctions, self.attributes.totals).length > 0)
                return true;
            else
                return false;
        },

        buildResult:function (reducedResult, originalFields, partitionFields, dimensions, aggregationFunctions, aggregatedFields, partitions) {

            var partitioning = false;

            if (partitions != null) {
                var partitioning = true;
            }

            var tmpField;
            if (dimensions == null) {
                tmpField = reducedResult;
            }
            else {
                if (reducedResult.length > 0) {
                    tmpField = reducedResult[0].value;
                }
                else
                    tmpField = {count:0};
            }

            var result = [];

            // set  results of dataset
            for (var i = 0; i < reducedResult.length; i++) {

                var currentField;
                var currentResult = reducedResult[i];
                var tmp;

                // if dimensions specified add dimension' fields
                if (dimensions != null) {
                    var keyField = reducedResult[i].key.split("#");

                    tmp = {dimension:currentResult.key, count:currentResult.value.count};

                    for (var j = 0; j < keyField.length; j++) {
                        var field = dimensions[j];
                        var originalFieldAttributes = originalFields.get(field).attributes;
                        var type = originalFieldAttributes.type;

                        var parse = recline.Data.FormattersMoviri[type];
                        var value = parse(keyField[j]);

                        tmp[dimensions[j]] = value;
                    }
                    currentField = currentResult.value;

                }
                else {
                    currentField = currentResult;
                    tmp = {count:currentResult.count};
                }

                // add records foreach aggregation function
                for (var j = 0; j < aggregationFunctions.length; j++) {

                    // apply finalization function, was not applied since now
                    // todo verify if can be moved above
                    // note that finalization can't be applyed at init cause we don't know in advance wich partitions data are present


                    var tmpPartitionFields = [];
                    if (partitionFields[aggregationFunctions[j]] != null)
                        tmpPartitionFields = partitionFields[aggregationFunctions[j]];
                    recline.Data.Aggregations.finalizeFunctions[aggregationFunctions[j]](
                        currentField,
                        aggregatedFields,
                        _.keys(tmpPartitionFields));

                    var tempValue;


                    if (typeof currentField[aggregationFunctions[j]] == 'function')
                        tempValue = currentField[aggregationFunctions[j]]();
                    else
                        tempValue = currentField[aggregationFunctions[j]];


                    for (var x in tempValue) {

                        var tempValue2;
                        if (typeof tempValue[x] == 'function')
                            tempValue2 = tempValue[x]();
                        else
                            tempValue2 = tempValue[x];

                        tmp[x + "_" + aggregationFunctions[j]] = tempValue2;
                    }


                    // adding partition records
                    if (partitioning) {
                        var tempValue;
                        if (typeof currentField.partitions[aggregationFunctions[j]] == 'function')
                            tempValue = currentField.partitions[aggregationFunctions[j]]();
                        else
                            tempValue = currentField.partitions[aggregationFunctions[j]];

                        for (var x in tempValue) {
                            var tempValue2;
                            if (typeof currentField.partitions[aggregationFunctions[j]] == 'function')
                                tempValue2 = currentField.partitions[aggregationFunctions[j]]();
                            else
                                tempValue2 = currentField.partitions[aggregationFunctions[j]];

                            var fieldName = x + "_" + aggregationFunctions[j];

                            tmp[fieldName] = tempValue2[x].value;


                        }

                    }

                }

                // count is always calculated for each partition
                if (partitioning) {
                    for (var x in tmpField.partitions["count"]) {
                        if (currentResult.value.partitions["count"][x] == null)
                            tmp[x + "_count"] = 0;
                        else
                            tmp[x + "_count"] = currentResult.value.partitions["count"][x].value;
                    }
                }


                result.push(tmp);
            }

            return result;
        },

        buildFields:function (reducedResult, originalFields, partitionFields, dimensions, aggregationFunctions) {
            var self = this;

            var fields = [];

            var tmpField;
            if (dimensions == null ) {
                if(reducedResult.constructor != Array)
                    tmpField = reducedResult;
                else
                if (reducedResult.length > 0) {
                    tmpField = reducedResult[0];
                }
                else
                    tmpField = {count:0};
            }
            else {
                if (reducedResult.length > 0) {
                    tmpField = reducedResult[0].value;
                }
                else
                    tmpField = {count:0};
            }


            // creation of fields

            fields.push({id:"count", type:"integer"});

            // defining fields based on aggreagtion functions
            for (var j = 0; j < aggregationFunctions.length; j++) {

                var tempValue;
                if (typeof tmpField[aggregationFunctions[j]] == 'function')
                    tempValue = tmpField[aggregationFunctions[j]]();
                else
                    tempValue = tmpField[aggregationFunctions[j]];

                for (var x in tempValue) {
                    var originalField = originalFields.get(x);
                    if(!originalField)
                    throw "Virtualmodel: unable to find field ["+x+"] in model";

                    var originalFieldAttributes = originalField.attributes;


                    var newType = recline.Data.Aggregations.resultingDataType[aggregationFunctions[j]](originalFieldAttributes.type);

                    var fieldLabel = x + "_" + aggregationFunctions[j];

                    if (self.attributes.fieldLabelForFields) {
                        fieldLabel = self.attributes.fieldLabelForFields
                            .replace("{originalFieldLabel}", originalFieldAttributes.label)
                            .replace("{aggregatedFunction}", aggregationFunctions[j]);
                    }


                    fields.push({
                        id:x + "_" + aggregationFunctions[j],
                        type:newType,
                        is_partitioned:false,
                        colorSchema:originalFieldAttributes.colorSchema,
                        shapeSchema:originalFieldAttributes.shapeSchema,
                        originalField:x,
                        aggregationFunction:aggregationFunctions[j],
                        label:fieldLabel
                    });
                }

                // add partition fields
                _.each(partitionFields, function (aggrFunction) {
                    _.each(aggrFunction, function (d) {
                        var originalFieldAttributes = originalFields.get(d.field).attributes;
                        var newType = recline.Data.Aggregations.resultingDataType[aggregationFunctions[j]](originalFieldAttributes.type);

                        var fieldId = d.id;
                        var partitionedFieldLabel = fieldId;

                        if (self.attributes.fieldLabelForPartitions) {
                            partitionedFieldLabel = self.attributes.fieldLabelForPartitions
                                .replace("{originalField}", d.originalField)
                                .replace("{partitionFieldName}", d.field)
                                .replace("{partitionFieldValue}", d.value)
                                .replace("{aggregatedFunction}", aggregationFunctions[j]);
                        }

                        fields.push({
                                id:fieldId,
                                type:newType,
                                is_partitioned:true,
                                partitionField:d.field,
                                partitionValue:d.value,
                                colorSchema:originalFieldAttributes.colorSchema, // the schema is the one used to specify partition
                                shapeSchema:originalFieldAttributes.shapeSchema,
                                originalField:d.originalField,
                                aggregationFunction:aggregationFunctions[j],
                                label:partitionedFieldLabel
                            }
                        );
                    })
                });

            }

            // adding all dimensions to field list
            if (dimensions != null) {
                fields.push({id:"dimension"});
                for (var i = 0; i < dimensions.length; i++) {
                    var field = originalFields.get(dimensions[i]);
                    if(!field)
                        throw "VirtualModel.js: unable to find field [" + dimensions[i] + "] in model";
                    var originalFieldAttributes = field.attributes;
                    fields.push({
                        id:dimensions[i],
                        type:originalFieldAttributes.type,
                        label:originalFieldAttributes.label,
                        format:originalFieldAttributes.format,
                        colorSchema:originalFieldAttributes.colorSchema,
                        shapeSchema:originalFieldAttributes.shapeSchema
                    });

                }
            }


            return fields;
        },

        query:function (queryObj) {
            var self=this;
            self.trigger('query:start');
            if (queryObj) {
                this.queryState.set(queryObj, {silent:true});
            }

            self.clearFilteredTotals();

            self.vModel.query(queryObj);

            self.recordCount = self.vModel.recordCount;


            self.trigger('query:done');
        },

        selection:function (queryObj) {
           return this.vModel.selection(queryObj);

        },

        setColorSchema:function (type) {
            return this.vModel.setColorSchema(type);

        },

        setShapeSchema:function (type) {
            return this.vModel.setShapeSchema(type);
        },

        /*addColorsToTerms:function (field, terms) {
            var self = this;
            _.each(terms, function (t) {

                // assignment of color schema to fields
                if (self.attributes.colorSchema) {
                    _.each(self.attributes.colorSchema, function (d) {
                        if (d.field === field)
                            t.color = d.schema.getColorFor(t.term);
                    })
                }
            });
        },*/

        getFacetByFieldId:function (fieldId) {
            return this.vModel.getFacetByFieldId(fieldId);
        },

        toTemplateJSON:function () {
            return this.vModel.toTemplateJSON();
        },

        getFieldsSummary:function () {
            return this.vModel.getFieldsSummary();
        },

        // Retrieve the list of partitioned field for the specified aggregated field
        getPartitionedFields:function (partitionedField, measureField) {
            //var field = this.fields.get(fieldName);

            var fields = _.filter(this.fields.models, function (d) {
                return (
                    d.attributes.partitionField == partitionedField
                        && d.attributes.originalField == measureField
                    );
            });

            if (fields == null)
                field = [];

            //fields.push(field);

            return fields;

        },

        isFieldPartitioned:function (fieldName, type) {
            return  this.getFields(type).get(fieldName).attributes.aggregationFunction
                && this.attributes.aggregation.partitions;
        },

        getPartitionedFieldsForAggregationFunction:function (aggregationFunction, aggregatedFieldName) {
            var self = this;
            var fields = [];

            _.each(self.partitionFields[aggregationFunction], function (p) {
                if (p.originalField == aggregatedFieldName)
                    fields.push(self.fields.get(p.id));
            });

            return fields;
        },

        addCustomFilterLogic: function(f) {
            return this.vModel.addCustomFilterLogic(f);
        }


    });


}(jQuery, this.recline.Model));

this.recline = this.recline || {};

(function ($, my) {

    my.ActionUtility = {};


    my.ActionUtility.doAction = function (actions, eventType, eventData) {

        // find all actions configured for eventType
        var targetActions = _.filter(actions, function (d) {
            var tmpFound = _.find(d["event"], function (x) {
                return x == eventType
            });
            if (tmpFound != -1)
                return true;
            else
                return false;
        });

        // foreach action prepare field
        _.each(targetActions, function (currentAction) {
            var mapping = currentAction.mapping;
            var actionParameters = [];
            //foreach mapping set destination field
            _.each(mapping, function (map) {
            	if (eventData[map["srcField"]] == null && currentAction.action.attributes.filters[map.filter].type != "list") {
                    console.log("warn: sourceField: [" + map["srcField"] + "] not present in event data");
                } else {
                    var param = {
                        filter:map["filter"],
                        value:eventData[map["srcField"]]
                    };
                    actionParameters.push(param);
                }
            });
            if (actionParameters.length > 0) {
                currentAction.action._internalDoAction(actionParameters);
            }
        });
    },

        my.ActionUtility.getActiveFilters = function (actions) {

            var activeFilters = [];
            _.each(actions, function (currentAction) {
                _.each(currentAction.mapping, function (map) {
                    var currentFilter = currentAction.action.getActiveFilters(map.filter, map.srcField);
                    if (currentFilter != null && currentFilter.length > 0)
                        activeFilters = _.union(activeFilters, currentFilter);
                })
            });

            return activeFilters;
        },

// ## <a id="dataset">Action</a>
        my.Action = Backbone.Model.extend({
            constructor:function Action() {
                Backbone.Model.prototype.constructor.apply(this, arguments);
            },

            initialize:function () {

            },

            doAction:function (records, mapping) {
                var params = [];
                mapping.forEach(function (mapp) {
                    var values = [];
                    //{srcField: "daydate", filter: "filter_daydate"}
                    records.forEach(function (row) {
                        values.push(row.getFieldValueUnrendered({id:mapp.srcField}));
                    });
                    params.push({
                        filter:mapp.filter,
                        value:values
                    });
                });
                this._internalDoAction(params);
            },
            doActionWithFacets:function (facetTerms, valueList, mapping, filterFieldName) {
                var params = [];
                mapping.forEach(function (mapp) {
                    var values = [];
                    //{srcField: "daydate", filter: "filter_daydate"}
                    facetTerms.forEach(function (obj) {
                    	obj.records.forEach(function(row) {
                    		var filterFieldValue = row[filterFieldName]
                    		if (_.contains(valueList, filterFieldValue)) 
                    			values.push(row[mapp.srcField]);
                    	});
                    });
                    params.push({
                        filter:mapp.filter,
                        value:values
                    });
                });
                this._internalDoAction(params);
            },
            doActionWithValues:function (valuesarray, mapping) {
                var params = [];
                mapping.forEach(function (mapp) {
                    var values = [];
                    //{srcField: "daydate", filter: "filter_daydate"}
                    _.each(valuesarray, function (row) {
                        if (row.field === mapp.srcField)
                            params.push({
                                filter:mapp.filter,
                                value:row.value
                            });
                    });

                });
                    this._internalDoAction(params);
            },


            // action could be add/remove
            _internalDoAction:function (data) {
                var self = this;

                var filters = this.attributes.filters;
                var models = this.attributes.models;
                var type = this.attributes.type;

                var targetFilters = [];

                //populate all filters with data received from event
                //foreach filter defined in data
                _.each(data, function (f) {
                    // filter creation
                    var currentFilter = filters[f.filter];
                    if (currentFilter == null) {
                        throw "Filter " + f.filter + " defined in actions data not configured for action ";
                    }
                    currentFilter["name"] = f.filter;
                    if (self.filters[currentFilter.type] == null)
                        throw "Filter not implemented for type " + currentFilter.type;

                    targetFilters.push(self.filters[currentFilter.type](currentFilter, f.value));

                });

                // foreach type and dataset add all filters and trigger events
                _.each(type, function (type) {
                    _.each(models, function (m) {
                    	// use the same starting filter object on all datasets, to ensure setFilter works correctly on filter removal
                    	var clonedTargetFilters = []
                    	_.each(targetFilters, function(targetF) {
                    		clonedTargetFilters.push(_.clone(targetF))
                    	}) 
                        var modified = false;

                        _.each(clonedTargetFilters, function (f) {

                            // verify if filter is associated with current model
                            if (_.find(m.filters, function (x) {
                                return x == f.name;
                            }) != null) {
                                // if associated add the filter

                                self.modelsAddFilterActions[type](m.model, f);
                                modified = true;

                            }
                        });

                        if (modified) {
                            self.modelsTriggerActions[type](m.model);
                        }
                    });
                });
                // at this points all filter removals have already been parsed. 
                // so: delete all "remove" flags from internal filter list 
                _.each(data, function (f) {
                    var currentFilter = filters[f.filter];
                    delete currentFilter["remove"]
                });

            },

            getActiveFilters:function (filterName, srcField) {
                var self = this;
                var models = this.attributes.models;
                var type = this.attributes.type;
                var filtersProp = this.attributes.filters;

                // for each type
                // foreach dataset
                // get filter
                // push to result, if already present error
                var foundFilters = [];

                _.each(type, function (type) {
                    _.each(models, function (m) {
                        var usedFilters = _.filter(m.filters, function (f) {
                            return f == filterName;
                        });
                        _.each(usedFilters, function (f) {
                            // search filter
                            var filter = filtersProp[f];
                            if (filter != null) {
                                var filterOnModel = self.modelsGetFilter[type](m.model, filter.field);
                                // substitution of fieldname with the one provided by source
                                if (filterOnModel != null) {
                                    filterOnModel.field = srcField;
                                    foundFilters.push(filterOnModel);
                                }
                            }
                        });
                    });
                });


                return foundFilters;
            },


            modelsGetFilter:{
                filter:function (model, fieldName) {
                    return model.queryState.getFilterByFieldName(fieldName);
                },
                selection:function (model, fieldName) {
                    throw "Action.js selection not implemented selection for selection"
                },
                sort:function (model, fieldName) {
                    throw "Action.js sort not implemented selection for sort"
                }
            },

            modelsAddFilterActions:{
                filter:function (model, filter) {
                    model.queryState.setFilter(filter)
                },
                selection:function (model, filter) {
                    model.queryState.setSelection(filter)
                },
                sort:function (model, filter) {
                    model.queryState.clearSortCondition();
                    model.queryState.setSortCondition(filter)
                }
            },


            modelsTriggerActions:{
                filter:function (model) {
                    model.queryState.trigger("change")
                },
                selection:function (model) {
                    model.queryState.trigger("selection:change")
                },
                sort:function (model) {
                    model.queryState.trigger("change")
                }
            },

            filters:{
                term:function (filter, data) {

                    if (data.length === 0) {
                        //empty list
                        filter["term"] = null;
                    } else if (data.length === 1) {
                    	if(data[0] == null)
                    		filter["remove"] = true;
                    	else
                    		filter["term"] = data[0];
                    } else {
                        throw "Data passed for filtertype term not valid. Data lenght should be 1 or empty but is " + data.length;
                    }

                    return filter;
                },
                range:function (filter, data) {

                    if (data.length === 0) {
                        //empty list
                        filter["start"] = null;
                        filter["stop"] = null;
                    } else if (data[0] === null || data[1] === null) {
                        //null list
                        filter["remove"] = true;
                    } else if (data.length === 2) {
                        filter["start"] = data[0];
                        filter["stop"] = data[1];
                    } else {
                        throw "Data passed for filtertype range not valid. Data lenght should be 2 but is " + data.length;
                    }

                    return filter;
                },
                list:function (filter, data) {

                	if (data === null) {
                        //empty list
                        filter["list"] = null;
                	}
                	else if (data.length === 0) {
                        //null list
                        filter["remove"] = true;
                        filter["list"] = [];
                    } else {
                        filter["list"] = data;
                    }

                    return filter;
                },
                sort:function (sort, data) {

                    if (data.length === 0) {
                        sort = null;
                    } else if (data.length == 2) {
                        sort["field"] = data[0];
                        sort["order"] = data[1];
                    } else {
                        throw "Actions.js: invalid data length [" + data + "]";
                    }

                    return sort;
                }
            }




        })


}(jQuery, this.recline));
this.recline = this.recline || {};
this.recline.Data = this.recline.Data || {};

(function(my){
	
	my.Aggregations = {};

    my.Aggregations.aggregationFunctions = {
        sum         : function (p,v) {
            if(p==null) p=0;
            return p+v;
        },
        avg         : function (p, v) {},
        max         : function (p, v) {
            if(p==null)
                return v;
            return Math.max(p, v);
        },
        min         : function (p, v) {
            if(p==null)
                return v;
            return Math.min(p, v);
        },
        ratioToReport: function (p, v) {},
        ratioToMax: function (p, v) {},
        runningTotal: function (p, v) {}
    };

    my.Aggregations.initFunctions = {
        sum           : function () {},
        avg           : function () {},
        max           : function () {},
        min           : function () {},
        ratioToReport : function () {},
        ratioToMax    : function () {},
        runningTotal  : function () {}
    };

    my.Aggregations.resultingDataType = {
        sum           : function (original) { return original },
        avg           : function (original) { return "float"},
        max           : function (original) { return original},
        min           : function (original) { return original},
        ratioToReport : function (original) { return "float"},
        ratioToMax :    function (original) { return "float"},
        runningTotal  : function (original) { return original}
    },

    my.Aggregations.finalizeFunctions = {
        sum         : function () {},
        avg         : function (resultData, aggregatedFields, partitionsFields) {


            resultData.avg = function(aggr, part){

                return function(){

                    var map = {};
                    for(var o=0;o<aggr.length;o++){
                        map[aggr[o]] = this.sum[aggr[o]] / this.count;
                    }
                    return map;
                }
            }(aggregatedFields, partitionsFields);

            if(partitionsFields != null && partitionsFields.length > 0) {


                resultData.partitions.avg = function(aggr, part){

                return function(){

                    var map = {};
                    for (var j=0;j<part.length;j++) {
                        if(resultData.partitions.sum[part[j]])   {
                            map[part[j]] = {
                                value: resultData.partitions.sum[part[j]].value / resultData.partitions.count[part[j]].value,
                                partition: resultData.partitions.sum[part[j]].partition
                            };
                        }
                    }
                    return map;
                }
            }(aggregatedFields, partitionsFields);

            }


        },
        max                     : function () {},
        min                     : function () {},
        ratioToReport           : function () {},
        ratioToMax              : function () {},
        runningTotal            : function () {}
    };

    my.Aggregations.tableCalculations = {
        ratioToReport : function (aggregatedFields, p, r, totalRecords) {
            _.each(aggregatedFields, function(f) {
                if(totalRecords[f + "_sum_sum"] > 0)
                    r[f + "_ratioToReport"]  = r[f + "_sum"] / totalRecords[f + "_sum_sum"];
            });
            return r;
        },
            ratioToMax : function (aggregatedFields, p, r, totalRecords) {
            _.each(aggregatedFields, function(f) {
                if(totalRecords[f + "_sum_max"] > 0)
                    r[f + "_ratioToMax"]  = r[f + "_sum"] / totalRecords[f + "_sum_max"];
            });
                return r;
        },
        runningTotal : function (aggregatedFields, p, r, totalRecords) {
            _.each(aggregatedFields, function(f) {
                if(p)
                    r[f + "_runningTotal"]  =  r[f + "_sum"] + p[f + "_runningTotal"] ;
                else
                    r[f + "_runningTotal"] = r[f + "_sum"];
            });
            return r;
        }
    };
    
	var myIsEqual = function (object, other, key) {

        var spl = key.split('.'),
            val1, val2;

        if (spl.length > 0) {
            val1 = object;
            val2 = other;

            for (var k = 0; k < spl.length; k++) {
                arr = spl[k].match(/(.*)\[\'?(\d*\w*)\'?\]/i);
                if (arr && arr.length == 3) {
                    val1 = (val1[arr[1]]) ? val1[arr[1]][arr[2]] : val1[spl[k]];
                    val2 = (val2[arr[1]]) ? val2[arr[1]][arr[2]] : val2[spl[k]];
                } else {
                    val1 = val1[spl[k]];
                    val2 = val2[spl[k]];
                }
            }
        }
        return _.isEqual(val1, val2);
    };

    my.Aggregations.intersectionObjects = my.Aggregations.intersectObjects = function (key, array) {
        var slice = Array.prototype.slice;
        // added this line as a utility
        var rest = slice.call(arguments, 1);
        return _.filter(_.uniq(array), function (item) {
            return _.every(rest, function (other) {
                //return _.indexOf(other, item) >= 0;
                return _.any(other, function (element) {
                    var control = myIsEqual(element, item, key);
                    if (control) _.extend(item, element);
                    return control;
                });
            });
        });
    };

    my.Aggregations.checkTableCalculation = function(aggregationFunctions, totalsConfig) {
      var tableCalc = _.intersection(aggregationFunctions, ["runningTotal", "ratioToReport", "ratioToMax"]);
      if(tableCalc.length > 0) {
          _.each(tableCalc, function(d) {
             if(!_.intersection(totalsConfig.aggregationFunctions, my.Aggregations.tableCalculationDependencies[d]))
                 throw "Data.Aggregation: unable to calculate " + d + ", totals aggregation function ["+ my.Aggregations.tableCalculationDependencies[d] + "] must be defined";
          });
      }

        return tableCalc;
    };

    my.Aggregations.tableCalculationDependencies =  {
        runningTotal: [],
        ratioToReport: ["sum"],
        ratioToMax: ["max"]
    };

})(this.recline.Data);// # Recline Backbone Models
this.recline = this.recline || {};
this.recline.Data = this.recline.Data || {};
this.recline.Data.ColorSchema = this.recline.Data.ColorSchema || {};

(function ($, my) {

    my.ColorSchema = Backbone.Model.extend({
        constructor: function ColorSchema() {
            Backbone.Model.prototype.constructor.apply(this, arguments);
        },

        // ### initialize
        initialize: function () {
            var self = this;


            if (this.attributes.data) {
                var data = this.attributes.data;
                self._generateLimits(data);
            } else if (this.attributes.dataset) {
                this.bindToDataset();
            } else if (this.attributes.fields) {
                var data = this.attributes.fields;
                this.attributes.type = "scaleWithDistinctData";
                self._generateLimits(data);
            }


            if (this.attributes.twoDimensionalVariation) {
                if (this.attributes.twoDimensionalVariation.data) {
                    var data = this.attributes.twoDimensionalVariation.data;
                    self._generateVariationLimits(data);
                } else if (this.attributes.twoDimensionalVariation.dataset) {
                    this.bindToVariationDataset();
                }
            }
        },

        // generate limits from dataset values
        bindToDataset: function () {
            var self = this;
            self.attributes.dataset.dataset.records.bind('reset', function () {
                self._generateFromDataset();
            });
            self.attributes.dataset.dataset.fields.bind('reset', function () {
                self.attributes.dataset.dataset.setColorSchema(self.attributes.dataset.type);
            });
            self.attributes.dataset.dataset.fields.bind('add', function () {
                self.attributes.dataset.dataset.setColorSchema(self.attributes.dataset.type);
            });
            if (self.attributes.dataset.dataset.records.models.length > 0) {
                self._generateFromDataset();
            }
        },

        bindToVariationDataset: function () {
            var self = this;
            self.attributes.twoDimensionalVariation.dataset.dataset.records.bind('reset', function () {
                self._generateFromVariationDataset();
            });


            if (self.attributes.twoDimensionalVariation.dataset.dataset.records.models.length > 0) {
                self._generateFromVariationDataset();
            }
        },


        setDataset: function (ds, field, type) {
            var self = this;

            if (!ds.attributes["colorSchema"])
                ds.attributes["colorSchema"] = [];

            // if I'm bounded to a fields name I don't need to refresh upon model update and I don't need to calculate limits on data
            if (self.attributes.fields) {
                _.each(self.attributes.fields, function (s) {
                    ds.attributes["colorSchema"].push({schema: self, field: s});
                });
            } else {
                self.attributes.dataset = {dataset: ds, field: field, type: type};


                ds.attributes["colorSchema"].push({schema: self, field: field});
                self.bindToDataset();
            }

            ds.setColorSchema(type);


        },

        setVariationDataset: function (ds, field) {
            var self = this;
            self.attributes["twoDimensionalVariation"] = {dataset: {dataset: ds, field: field} };

            self.bindToVariationDataset();
        },

        _generateFromDataset: function () {
            var self = this;
            var data = this.getRecordsArray(self.attributes.dataset);
            self._generateLimits(data);

        },

        _generateFromVariationDataset: function () {
            var self = this;
            var data = this.getRecordsArray(self.attributes.twoDimensionalVariation.dataset);
            self._generateVariationLimits(data);
        },

        _generateLimits: function (data) {
            var self = this;
            switch (this.attributes.type) {
                case "scaleWithDataMinMax":
                    self.schema = new chroma.ColorScale({
                        colors: this.attributes.colors,
                        limits: this.limits["minMax"](data)
                    });
                    break;
                case "scaleWithDistinctData":
                    self.schema = new chroma.ColorScale({
                        colors: this.attributes.colors,
                        limits: [0, 1]
                    });
                    self.limitsMapping = this.limits["distinct"](data, self.oldLimitData);
                    self.oldLimitData =  data;
                    break;
                case "fixedLimits":
                    self.schema = new chroma.ColorScale({
                        colors: this.attributes.colors,
                        limits: this.attributes.limits
                    });
                    break;
                default:
                    throw "data.colors.js: unknown or not defined properties type [" + this.attributes.type + "] possible values are [scaleWithDataMinMax,scaleWithDistinctData,fixedLimits]";
            }
        },

        getScaleType: function () {
            return this.attributes.type;
        },

        getScaleLimits: function () {
            return this.schema.limits;
        },

        _generateVariationLimits: function (data) {
            var self = this;
            self.variationLimits = this.limits["minMax"](data);
        },

        getColorFor: function (fieldValue) {
            var self = this;
            if (this.schema == null && !self.attributes.defaultColor)
                throw "data.colors.js: colorschema not yet initialized, datasource not fetched?"

            //var hashed = recline.Data.Transform.getFieldHash(fieldValue);

            if (self.limitsMapping) {
                if (self.limitsMapping[fieldValue] != null) {
                    return this.schema.getColor(self.limitsMapping[fieldValue]);
                } else {
                    return chroma.hex(self.attributes.defaultColor);
                }
            }
            else {
                if (self.schema) {
                    return this.schema.getColor(fieldValue);
                } else {
                    return chroma.hex(self.attributes.defaultColor);
                }
            }



        },

        getTwoDimensionalColor: function (startingvalue, variation) {
            if (this.schema == null)
                throw "data.colors.js: colorschema not yet initialized, datasource not fetched?"

            if (this.attributes.twoDimensionalVariation == null)
                return this.getColorFor(startingvalue);

            var endColor = '#000000';
            if (this.attributes.twoDimensionalVariation.type == "toLight")
                endColor = '#ffffff';


            var self = this;

            var tempSchema = new chroma.ColorScale({
                colors: [self.getColorFor(startingvalue), endColor],
                limits: self.variationLimits,
                mode: 'hsl'
            });

            return tempSchema.getColor(variation);

        },

        getRecordsArray: function (dataset) {

            var ret = [];

            if (dataset.dataset.isFieldPartitioned && dataset.dataset.isFieldPartitioned(dataset.field)) {
                var fields = dataset.dataset.getPartitionedFields(dataset.field);
                _.each(dataset.dataset.getRecords(dataset.type), function (d) {
                    _.each(fields, function (field) {
                        ret.push(d.attributes[field.id]);
                    });
                });
            }
            else {
                var fields = [dataset.field];

                _.each(dataset.dataset.getRecords(dataset.type), function (d) {
                    _.each(fields, function (field) {
                        ret.push(d.attributes[field]);
                    });
                });
            }


            return ret;
        },


        limits: {
            minMax: function (data) {
                var limit = [null, null];
                _.each(data, function (d) {
                    if (limit[0] == null)    limit[0] = d;
                    else                    limit[0] = Math.min(limit[0], d);

                    if (limit[1] == null)    limit[1] = d;
                    else                    limit[1] = Math.max(limit[1], d);
                });

                return limit;
            },
            distinct: function () {


                var arrayHash = function (data) {
                    var hash = 0,
                        i, j, _char;
                    if (data.length === 0) return hash;
                    for (i = 0; i < data.length; i++) {
                        for (j = 0; j < data[i].length; j++) {
                            _char = data[i].charCodeAt(j);
                            hash = ((hash << 5) - hash) + _char;
                            hash = hash & hash; // Convert to 32bit integer
                        }
                    }
                    return hash;
                };

                var closestSize = function () {
                    var sizeCache = {};

                    var nextSize = function (n) {
                        return n + n - 1;
                    };

                    return function (size) {
                        if (sizeCache[size]) {
                            return sizeCache[size];
                        } else {
                            var n = 2;
                            while (n < size) {
                                n = nextSize(n);
                            }
                            sizeCache[size] = n;
                            return n;
                        }
                    };
                }();

                var computePosition = function (i, length, max) {
                    return (i) / (max - 1);
                };

                var arrayCache = {};
                var emptyCache = {};

                return function (data, data_old) {

                    var obj = {};
                    var poss = {};
                    var empty = [];
                    var i;

                    if (data) data.sort(function (a, b) {
                        if (a > b) return 1;
                        if (b > a) return -1;
                        return 0;
                    });
                    else data = [];

                    if (data_old) data_old.sort(function (a, b) {
                        if (a > b) return 1;
                        if (b > a) return -1;
                        return 0;
                    });
                    else data_old = [];

                    var uniq = _.uniq(data, true);
                    var uniq_old = _.uniq(data_old, true);

                    var closeUO = closestSize(uniq_old.length);
                    var closeU = Math.max(closestSize(uniq.length), closeUO);

                    var hop = 0;
                    if (closeU > closeUO) {
                        hop = 1;
                    }

                    empty = (uniq_old.length) ? emptyCache[arrayHash(uniq_old)] : [];

                    if (hop > 0 && uniq_old.length !== 0) {
                        //nuove posizioni disponibili
                        //quali? per ora gestisco solo hop=1
                        for (i = 1; i < closeU; i = i + 2) empty.push(i);
                    }

                    if (uniq_old.length === 0) {
                        i = 0;
                        _.each(uniq, function (d) {
                            if (closeU === 1) obj[d] = 0;
                            else obj[d] = computePosition(i, uniq.length, closeU);
                            poss[d] = i;
                            i++;
                        });
                        for (i = uniq.length; i < closeU; i++) {
                            empty.push(i);
                        }
                    } else {
                        var j, pos;
                        var controlj = 0,
                            controli = 0;
                        var old_poss = arrayCache[arrayHash(uniq_old)];
                        i = 0;
                        j = 0;

                        while (!(controlj || controli)) {
                            if (uniq[i] === uniq_old[j]) {
                                i++;
                                j++;
                            } else if (uniq[i] < uniq_old[j]) {
                                i++;
                            } else {
                                //elemento rimosso
                                empty.push(j * Math.pow(2, hop));
                                j++;
                            }
                            controlj = j >= uniq_old.length;
                            controli = i >= uniq.length;
                        }

                        i = 0;
                        j = 0;
                        controlj = 0;
                        controli = 0;
                        while (!(controlj || controli)) {
                            if (uniq[i] === uniq_old[j]) {
                                pos = old_poss[uniq_old[j]] * Math.pow(2, hop);
                                poss[uniq[i]] = pos;
                                obj[uniq[i]] = computePosition(pos, uniq.length, closeU);
                                i++;
                                j++;
                            } else if (uniq[i] < uniq_old[j]) {
                                //nuovo elemento
                                pos = empty.pop();
                                poss[uniq[i]] = pos;
                                obj[uniq[i]] = computePosition(pos, uniq.length, closeU);
                                i++;
                            } else {
                                j++;
                            }
                            controlj = j >= uniq_old.length;
                            controli = i >= uniq.length;
                        }
                        if (!controli) {
                            for (; i < uniq.length; i++) {
                                //nuovo elemento
                                pos = empty.pop();
                                poss[uniq[i]] = pos;
                                obj[uniq[i]] = computePosition(pos, uniq.length, closeU);
                            }
                        }
                    }

                    arrayCache[arrayHash(uniq)] = poss;
                    emptyCache[arrayHash(uniq)] = empty;

                    return obj;
                };
            }()
        }








    });

    my.ColorSchema.addColorsToTerms = function (field, terms, colorSchema) {
        _.each(terms, function (t) {

            // assignment of color schema to fields
            if (colorSchema) {
                _.each(colorSchema, function (d) {
                    if (d.field === field)
                        t.color = d.schema.getColorFor(t.term);
                })
            }
        });
    };
}(jQuery, this.recline.Data));
this.recline = this.recline || {};
this.recline.Data = this.recline.Data || {};

(function(my) {


my.Faceting = {};
    my.Faceting.computeFacets = function (records, queryObj) {
        var self = this;
        var facetResults = {};
        if (!queryObj.facets) {
            return facetResults;
        }
        _.each(queryObj.facets, function (query, facetId) {
            // TODO: remove dependency on recline.Model
            facetResults[facetId] = new recline.Model.Facet({id:facetId}).toJSON();
            facetResults[facetId].termsall = {};

        });
        // faceting
        _.each(records, function (doc) {
            _.each(queryObj.facets, function (query, facetId) {
                var fieldId = query.terms.field;
                var val = doc[fieldId];
                var tmp = facetResults[facetId];
                if (val) {
                    tmp.termsall[val] = tmp.termsall[val] ? {count:tmp.termsall[val].count + 1, value:val, records: records.push(doc)} : {count:1, value:val, records: [doc]};
                } else {
                    tmp.missing = tmp.missing + 1;
                }
            });
        });

        // if all_terms is specified add terms not presents
        self.updateDistinctFieldsForFaceting(queryObj);

        _.each(queryObj.facets, function (query, facetId) {
            var tmp = facetResults[facetId];

            var termsWithZeroCount =
                _.difference(
                    self.distinctFieldsValues[facetId],
                    _.map(tmp.termsall, function (d) {
                        return d.value
                    })
                );

            _.each(termsWithZeroCount, function (d) {
                tmp.termsall[d] = {count:0, value:d, records: []    };
            });

        });


        _.each(queryObj.facets, function (query, facetId) {
            var tmp = facetResults[facetId];
            var terms = _.map(tmp.termsall, function (res, term) {
                return { term:res.value, count:res.count, records: res.records };
            });
            tmp.terms = _.sortBy(terms, function (item) {
                // want descending order
                return -item.count;
            });
        });


        return facetResults;
    };


    //update uniq values for each terms present in facets with value all_terms
    my.Faceting.updateDistinctFieldsForFaceting = function (queryObj) {
        var self = this;
        if (this.distinctFieldsValues == null)
            this.distinctFieldsValues = {};

        var fieldsToBeCalculated = [];

        _.each(queryObj.facets, function (query, fieldId) {
            if (query.terms.all_terms && self.distinctFieldsValues[fieldId] == null) {
                fieldsToBeCalculated.push(fieldId);
            }
        });

        if (fieldsToBeCalculated.length > 0) {
            _.each(fieldsToBeCalculated, function (d) {
                self.distinctFieldsValues[d] = []
            });

            _.each(self.data, function (d) {
                _.each(fieldsToBeCalculated, function (field) {
                    self.distinctFieldsValues[field].push(d[field]);
                });
            });
        }

        _.each(fieldsToBeCalculated, function (d) {
            self.distinctFieldsValues[d] = _.uniq(self.distinctFieldsValues[d])
        });

    };


}(this.recline.Data))
// # Recline Backbone Models
this.recline = this.recline || {};
this.recline.Data = this.recline.Data || {};
this.recline.Data.FieldsUtility = this.recline.Data.FieldsUtility || {};

(function($, my) {

    my.setFieldsAttributes = function(fields, model) {


        // if labels are declared in dataset properties merge it;
        if (model.attributes.fieldLabels) {
            for (var i = 0; i < fields.length; i++) {
                var tmp = _.find(model.attributes.fieldLabels, function (x) {
                    return x.id == fields[i].id;
                });
                if (tmp != null)
                    fields[i].label = tmp.label;


            }

        }

        // if format is declared it is updated
        if (model.attributes.fieldsFormat) {
            // if format is declared in dataset properties merge it;
            _.each(model.attributes.fieldsFormat, function (d) {
                var field = _.find(fields, function (f) {
                    return d.id === f.id
                });
                if (field != null)
                    field.format = d.format;
            })
        }


        // assignment of color schema to fields
        if (model.attributes.colorSchema) {
            _.each(model.attributes.colorSchema, function (d) {
                var field = _.find(fields, function (f) {
                    return d.field === f.id
                });
                if (field != null)
                    field.colorSchema = d.schema;
            })
        }

        // assignment of shapes schema to fields
        if (model.attributes.shapeSchema) {
            _.each(model.attributes.shapeSchema, function (d) {
                var field = _.find(fields, function (f) {
                    return d.field === f.id
                });
                if (field != null)
                    field.shapeSchema = d.schema;
            })
        }
    }


}(jQuery, this.recline.Data.FieldsUtility));
this.recline = this.recline || {};
this.recline.Data = this.recline.Data || {};

(function (my) {
// adapted from https://github.com/harthur/costco. heather rules

    my.Filters = {};

    // in place filtering (records.toJSON must be passed)
    my.Filters.applyFiltersOnData = function (filters, records, fields) {
        // filter records
        return _.filter(records, function (record) {
            var passes = _.map(filters, function (filter) {
                return recline.Data.Filters._isNullFilter[filter.type](filter) || recline.Data.Filters._filterFunctions[filter.type](record, filter, fields);
            });

            // return only these records that pass all filters
            return _.all(passes, _.identity);
        });
    };

    // in place filtering  (records model must be used)
    my.Filters.applyFiltersOnRecords = function (filters, records, fields) {
        // filter records
        return _.filter(records.models, function (record) {
            var passes = _.map(filters, function (filter) {
                return recline.Data.Filters._isNullFilter[filter.type](filter) || recline.Data.Filters._filterFunctions[filter.type](record.toJSON(), filter, fields.toJSON());
            });

            // return only these records that pass all filters
            return _.all(passes, _.identity);
        });
    };

    // data should be {records:[model], fields:[model]}
    my.Filters.applySelectionsOnRecord = function (selections, records, fields) {
        _.each(records, function (currentRecord) {
            currentRecord.setRecordSelection(false);

            _.each(selections, function (sel) {
                if (!recline.Data.Filters._isNullFilter[sel.type](sel) &&
                    recline.Data.Filters._filterFunctions[sel.type](currentRecord.attributes, sel, fields)) {
                    currentRecord.setRecordSelection(true);
                }
            });
        });


    },

 
        my.Filters._getDataParser = function (filter, fields) {

            var keyedFields = {};
            var tmpFields;
            if (fields.models)
                tmpFields = fields.models;
            else
                tmpFields = fields;

            _.each(tmpFields, function (field) {
                keyedFields[field.id] = field;
            });


            var field = keyedFields[filter.field];
            var fieldType = 'string';

            if (field == null) {
                throw "data.filters.js: Warning could not find field " + filter.field + " for dataset ";
            }
            else {
                if (field.attributes)
                    fieldType = field.attributes.type;
                else
                    fieldType = field.type;
            }
            return recline.Data.Filters._dataParsers[fieldType];
        },

        my.Filters._isNullFilter = {
            term:function (filter) {
                return filter["term"] == null;
            },

            range:function (filter) {
                return (filter["start"] == null || filter["stop"] == null);

            },

            list:function (filter) {
                return filter["list"] == null;

            },
            termAdvanced:function (filter) {
                return filter["term"] == null;
            }
        },

        // in place filtering
        this._applyFilters = function (results, queryObj) {
            var filters = queryObj.filters;
            // register filters
            var filterFunctions = {
                term:term,
                range:range,
                geo_distance:geo_distance
            };
            var dataParsers = {
                integer:function (e) {
                    return parseFloat(e, 10);
                },
                'float':function (e) {
                    return parseFloat(e, 10);
                },
                string:function (e) {
                    return e.toString()
                },
                date:function (e) {
                    return new Date(e).valueOf()
                },
                datetime:function (e) {
                    return new Date(e).valueOf()
                }
            };
            var keyedFields = {};
            _.each(self.fields, function (field) {
                keyedFields[field.id] = field;
            });
            function getDataParser(filter) {
                var fieldType = keyedFields[filter.field].type || 'string';
                return dataParsers[fieldType];
            }

            // filter records
            return _.filter(results, function (record) {
                var passes = _.map(filters, function (filter) {
                    return filterFunctions[filter.type](record, filter);
                });

                // return only these records that pass all filters
                return _.all(passes, _.identity);
            });


        };

    my.Filters._filterFunctions = {
        term:function (record, filter, fields) {
            var parse = recline.Data.Filters._getDataParser(filter, fields);
            var value = parse(record[filter.field]);
            var term = parse(filter.term);

            return (value === term);
        },

        range:function (record, filter, fields) {
            var startnull = (filter.start == null || filter.start === '');
            var stopnull = (filter.stop == null || filter.stop === '');
            var parse = recline.Data.Filters._getDataParser(filter, fields);
            var value = parse(record[filter.field]);
            var start = parse(filter.start);
            var stop = parse(filter.stop);

            // if at least one end of range is set do not allow '' to get through
            // note that for strings '' <= {any-character} e.g. '' <= 'a'
            if ((!startnull || !stopnull) && value === '') {
                return false;
            }
            return ((startnull || value >= start) && (stopnull || value <= stop));

        },

        list:function (record, filter, fields) {

            var parse = recline.Data.Filters._getDataParser(filter, fields);
            var value = parse(record[filter.field]);
            var list = filter.list;
            _.each(list, function (data, index) {
                list[index] = parse(data);
            });

            return (_.contains(list, value));
        },

        termAdvanced:function (record, filter, fields) {
            var parse = recline.Data.Filters._getDataParser(filter, fields);
            var value = parse(record[filter.field]);
            var term = parse(filter.term);

            var operator = filter.operator;

            var operation = {
                ne:function (value, term) {
                    return value !== term
                },
                eq:function (value, term) {
                    return value === term
                },
                lt:function (value, term) {
                    return value < term
                },
                lte:function (value, term) {
                    return value <= term
                },
                gt:function (value, term) {
                    return value > term
                },
                gte:function (value, term) {
                    return value >= term
                },
                bw:function (value, term) {
                    return _.contains(term, value)
                }
            };

            return operation[operator](value, term);
        }
    },

        my.Filters._dataParsers = {
            integer:function (e) {
                return parseFloat(e, 10);
            },
            float:function (e) {
                return parseFloat(e, 10);
            },
            string:function (e) {
                if (!e) return null; else return e.toString();
            },
            date:function (e) {
                return new Date(e).valueOf()
            },
            datetime:function (e) {
                return new Date(e).valueOf()
            },
            number:function (e) {
                return parseFloat(e, 10);
            }
        };
}(this.recline.Data))
this.recline = this.recline || {};
this.recline.Data = this.recline.Data || {};

(function(my){

	my.Format = {};
    my.Formatters = {};

    // formatters define how data is rapresented in internal dataset
    my.FormattersMoviri = {
        integer : function (e) { return (isFinite(e) ? parseInt(e, 10) : 0);},
        string  : function (e) { return (e ? e.toString() : null); }, 
        date    : function (e) { return new Date(parseInt(e)).valueOf() },
        float   : function (e) { return (isFinite(e) ? parseFloat(e, 10) : 0);},
        number  : function (e) { return (isFinite(e) ? parseFloat(e, 10) : 0);}
    };

    
    my.Format.decimal = d3.format(".00f");
	
	my.Format.scale = function(options) {
		var calculateRange = function(rangePerc, dimwidth){			
			return [0, rangePerc*dimwidth];
		};
		
		return function(records, width, range) {			
			var ret = {}, count;
			
			ret.axisScale = {};
			var calcRange = calculateRange(range, width);
			
			if (options.type === 'linear') {
				var max = d3.max(records, function(record) {
					var max=0;
					count=0;
					_.each(options.domain, function(field) {
						max = (record.getFieldValue({"id":field}) > max) ? record.getFieldValue({"id":field}) : max;
						count++;
					});
					return max*count;
				});
								
				_.each(options.domain, function(field, i){
					var domain;
					var frange = [calcRange[0],calcRange[1]/count];
					
					if(i%2==1 && options.invertEven){
						domain = [max/count, 0];
					}else{
						domain=[0, max/count];
					}					

					ret.axisScale[field] = d3.scale.linear().domain(domain).range(frange);
				});			
				
				ret.scale = d3.scale.linear().domain([0, max]).range(calcRange);
			}
			
			return ret;
		};
	};

    my.Formatters.Renderers = function(val, field, doc)   {

        var r = my.Formatters.RenderersImpl[field.attributes.type];
        if(r==null) {
            throw "No custom renderers defined for field type " + field.attributes.type;
        }

        return r(val, field, doc);
    };

    // renderers use fieldtype and fieldformat to generate output for getFieldValue
    my.Formatters.RenderersImpl = {
        object: function(val, field, doc) {
            return JSON.stringify(val);
        },
        integer: function(val, field, doc) {
            var format = field.get('format');
            if(format === "currency_euro") {
               // return "€ " + val;
            	return accounting.formatMoney(val, { symbol: "€",  format: "%v %s", decimal : ".", thousand: " ", precision : 0 }); // �4,999.99
            }           
            return accounting.formatNumber(val, 0, " ");
        },
        date: function(val, field, doc) {
            var format = field.get('format');
            if(format == null || format == "date")
                return val;
            if(format === "localeTimeString") {
                return (new Date(val)).toLocaleString();
            }

            return new Date(val).toLocaleString();
        },
        geo_point: function(val, field, doc) {
            return JSON.stringify(val);
        },
        number: function(val, field, doc) {
            var format = field.get('format');
            
            if (format === 'percentage') {
                try {
                    return accounting.formatNumber(val, 2, " ", ".") + '%';
                } catch(err) {
                    return "-";
                }


            } else if(format === "currency_euro") {
                try {
                    return accounting.formatMoney(val, { symbol: "€",  format: "%v %s", decimal : ".", thousand: " ", precision : 0 }); // �4,999.99
                 
                     
            		
                    // return "€ " + parseFloat(val.toFixed(2));
                } catch(err) {
                    return "-";
                }
            } else if(format === "currency_euro_decimal") {
                try {
                	return accounting.formatMoney(val, { symbol: "€",  format: "%v %s", decimal : ".", thousand: " ", precision : 2 }); // �4,999.99
                    
                    // return "€ " + parseFloat(val.toFixed(2));
                } catch(err) {
                    return "-";
                }
            }           
            
            else if(format === "integer") {
                try {
                	return accounting.formatNumber(val, 0, " ", ".");
                } catch(err) {
                    return "-";
                }
            }

            try {
            	return accounting.formatNumber(val, 2, " ", ".");
                // return parseFloat(val.toFixed(2));
            }
            catch(err) {
                //console.log("Error in conferting val " + val + " toFixed");
                return "-";
            }


        },
        string: function(val, field, doc) {
            var format = field.get('format');
            if (format === 'markdown') {
                if (typeof Showdown !== 'undefined') {
                    var showdown = new Showdown.converter();
                    out = showdown.makeHtml(val);
                    return out;
                } else {
                    return val;
                }
            } else if (format == 'plain') {
                return val;
            } else {
                // as this is the default and default type is string may get things
                // here that are not actually strings
                if (val && typeof val === 'string') {
                    val = val.replace(/(https?:\/\/[^ ]+)/g, '<a href="$1">$1</a>');
                }
                return val
            }
        }
    },

    my.Formatters.getFieldLabel = function (field, fieldLabels) {

        var fieldLabel = field.attributes.label;
        if (field.attributes.is_partitioned)
            fieldLabel = field.attributes.partitionValue;

        if (fieldLabels) {
            var fieldLabel_alternateObj = _.find(fieldLabels, function (fl) {
                return fl.id == fieldLabel
            });
            if (typeof fieldLabel_alternateObj != "undefined" && fieldLabel_alternateObj != null)
                fieldLabel = fieldLabel_alternateObj.label;
        }

        return fieldLabel;
    }

})(this.recline.Data);
this.recline = this.recline || {};
this.recline.Data = this.recline.Data || {};
this.recline.Data.SeriesUtility = this.recline.Data.SeriesUtility || {};



/*
    seriesAttr:
        groupField: field used to group data (x axis)
        defined a priori
            series: {type: "byFieldName", valuesField: [{fieldName: "fieldName1" fieldColor: ""}], sizeField: "fieldName", fillEmptyValuesWith: 0},
        calculated at runtime by the view based on field value
            series: {type: "byFieldValue", seriesField: "fieldName", valuesField: "fieldName1", sizeField: "fieldName", fillEmptyValuesWith: 0}
        calculated at runtime by the virtualmodel
            series: {type: "byPartitionedField", aggregatedField: "fieldName", sizeField: "fieldName", aggregationFunctions: ["fieldName1"]}

 unselectedColorValue: (optional) define the color of unselected datam default is #C0C0C0
        model: dataset source of data
 resultTypeValue: (optional) "filtered"/"unfiltered", let access to unfiltered data
 fieldLabels: (optional) [{id: fieldName, label: "fieldLabel"}]


 */
(function($, my) {
    my.createSeries = function (seriesAttr, unselectedColorValue, model, resultTypeValue, groupField) {
            var series = [];

            var fillEmptyValuesWith = seriesAttr.fillEmptyValuesWith;

            var unselectedColor = "#C0C0C0";
            if (unselectedColorValue)
                unselectedColor = unselectedColorValue;
            var selectionActive = false;
            if (model.queryState.isSelected())
                selectionActive = true;

            var resultType = "filtered";
            if (resultTypeValue)
                resultType = resultTypeValue;

            var records = model.getRecords(resultType);  //self.model.records.models;

            var xfield = model.fields.get(groupField);

        if (!xfield) {
            throw "data.series.utility.CreateSeries: unable to find field [" + groupField + "] in model [" + model.id + "]";
        }


        var uniqueX = [];
            var sizeField;
            if (seriesAttr.sizeField) {
                sizeField = model.fields.get(seriesAttr.sizeField);
            }


            // series are calculated on data, data should be analyzed in order to create series
            if (seriesAttr.type == "byFieldValue") {
                var seriesTmp = {};
                var seriesNameField = model.fields.get(seriesAttr.seriesField);
                var fieldValue = model.fields.get(seriesAttr.valuesField);


                if (!fieldValue) {
                    throw "data.series.utility.CreateSeries: unable to find field [" + seriesAttr.valuesField + "] in model [" + model.id + "]";
                }

                if (!seriesNameField) {
                    throw "data.series.utility.CreateSeries: unable to find field [" + seriesAttr.seriesField + "] in model [" + model.id + "]";
                }


                _.each(records, function (doc, index) {

                    // key is the field that identiy the value that "build" series
                    var key = doc.getFieldValueUnrendered(seriesNameField);
                    var tmpS;

                    // verify if the serie is already been initialized
                    if (seriesTmp[key] != null) {
                        tmpS = seriesTmp[key]
                    }
                    else {
                        tmpS = {name:key, data:[], field:fieldValue};

                        var color = doc.getFieldColor(seriesNameField);


                        if (color != null)
                            tmpS["color"] = color;


                    }
                    var shape = doc.getFieldShapeName(seriesNameField);

                    var x = doc.getFieldValueUnrendered(xfield);
                    var x_formatted = doc.getFieldValue(xfield);

                    var y = doc.getFieldValueUnrendered(fieldValue);
                    var y_formatted = doc.getFieldValue(fieldValue);

                    if (y && !isNaN(y)) {

                        var point = {x:x, y:y, record:doc, y_formatted:y_formatted, x_formatted:x_formatted};
                        if (sizeField)
                            point["size"] = doc.getFieldValueUnrendered(sizeField);
                        if (shape != null)
                            point["shape"] = shape;

                        tmpS.data.push(point);

                        if (fillEmptyValuesWith != null) {
                            uniqueX.push(x);
                        }

                        seriesTmp[key] = tmpS;
                    }
                });

                for (var j in seriesTmp) {
                    series.push(seriesTmp[j]);
                }

            }
            else if (seriesAttr.type == "byFieldName" || seriesAttr.type == "byPartitionedField") {
                var serieNames;

                // if partitions are active we need to retrieve the list of partitions
                if (seriesAttr.type == "byFieldName") {
                    serieNames = seriesAttr.valuesField;
                }
                else {
                    serieNames = [];
                    _.each(seriesAttr.aggregationFunctions, function (a) {
                        _.each(model.getPartitionedFieldsForAggregationFunction(a, seriesAttr.aggregatedField), function (f) {
                            serieNames.push(f.get("id"));
                        })

                    });

                }

                _.each(serieNames, function (field) {

                    var yfield;
                    if (seriesAttr.type == "byFieldName")
                        yfield = model.fields.get(field);

                    var fixedColor;
                    if (field.fieldColor)
                        fixedColor = field.fieldColor;

                    var points = [];

                    _.each(records, function (doc, index) {
                        var x = doc.getFieldValueUnrendered(xfield);
                        var x_formatted = doc.getFieldValue(xfield); // rickshaw don't use millis


                        try {

                            var y = doc.getFieldValueUnrendered(yfield);
                            var y_formatted = doc.getFieldValue(yfield);

                            if (y != null && !isNaN(y)) {
                                var color;

                                var calculatedColor = doc.getFieldColor(yfield);

                                if (selectionActive) {
                                    if (doc.isRecordSelected())
                                        color = calculatedColor;
                                    else
                                        color = unselectedColor;
                                } else
                                    color = calculatedColor;

                                var shape = doc.getFieldShapeName(yfield);

                                var point = {x:x, y:y, record:doc, y_formatted:y_formatted, x_formatted:x_formatted};

                                if (color != null)
                                    point["color"] = color;
                                if (shape != null)
                                    point["shape"] = shape;

                                if (sizeField)
                                    point["size"] = doc.getFieldValueUnrendered(sizeField);

                                points.push(point);

                                if (fillEmptyValuesWith != null) {
                                    uniqueX.push(x);
                                }
                            }

                        }
                        catch (err) {
                            //console.log("Can't add field [" + field + "] to graph, filtered?")
                        }
                    });

                    if (points.length > 0) {
                        var color;
                        if (fixedColor)
                            color = fixedColor;
                        else
                            color = yfield.getColorForPartition();
                        var ret = {data:points, name: recline.Data.Formatters.getFieldLabel(yfield, model.attributes.fieldLabels)};
                        if (color)
                            ret["color"] = color;
                        series.push(ret);
                    }

                });

            } else throw "data.series.utility.CreateSeries: unsupported or not defined type " + seriesAttr.type;

            // foreach series fill empty values
            if (fillEmptyValuesWith != null) {
                uniqueX = _.unique(uniqueX);
                _.each(series, function (s) {
                    // foreach series obtain the unique list of x
                    var tmpValues = _.map(s.data, function (d) {
                        return d.x
                    });
                    // foreach non present field set the value
                    _.each(_.difference(uniqueX, tmpValues), function (diff) {
                        s.data.push({x:diff, y:fillEmptyValuesWith});
                    });

                });
            }


        return series;
    };

}(jQuery, this.recline.Data.SeriesUtility));
// # Recline Backbone Models
this.recline = this.recline || {};
this.recline.Data = this.recline.Data || {};
this.recline.Data.ShapeSchema = this.recline.Data.ShapeSchema || {};

(function($, my) {



    my.ShapeSchema = Backbone.Model.extend({
        constructor: function ShapeSchema() {
            Backbone.Model.prototype.constructor.apply(this, arguments);
        },

        // ### initialize
        initialize: function() {
            var self=this;


            if(this.attributes.data) {
                var data = this.attributes.data;
                self._generateLimits(data);
            } else if(this.attributes.dataset)
                { this.bindToDataset();}

        },

        bindToDataset: function() {
           var self=this;
            self.attributes.dataset.dataset.records.bind('reset',   function() { self._generateFromDataset(); });
            self.attributes.dataset.dataset.fields.bind('reset', function () {
                self.attributes.dataset.dataset.setShapeSchema(self.attributes.dataset.type);
            });

            if(self.attributes.dataset.dataset.records.models.length > 0) {
                self._generateFromDataset();
            }
        },


        setDataset: function(ds, field, type) {
            var self=this;
            self.attributes.dataset = {dataset: ds, field: field, type: type};
            if(!ds.attributes["shapeSchema"])
                ds.attributes["shapeSchema"] = [];

            ds.attributes["shapeSchema"].push({schema:self, field: field});

            ds.setShapeSchema(type);

            self.bindToDataset();
        },


        _generateFromDataset: function() {
            var self=this;
            var data =  this.getRecordsArray(self.attributes.dataset);
            self._generateLimits(data);

        },

        _generateLimits: function(data) {
            var self=this;
            //var res = this.limits["distinct"](data);


            self.schema = {};
            _.each(self.attributes.limits, function(s, index) {
                self.schema[s] = self.attributes.shapes[index];
            });



        },


        getShapeNameFor: function(fieldValue) {
            var self=this;
            if(this.schema == null)
                throw "data.shape.js: shape schema not yet initialized, datasource not fetched?"


            return  self._shapeName(fieldValue);
        },


        getShapeFor: function(fieldValue, fieldColor, isSVG, isNode) {
            var self=this;
            if(this.schema == null)
                throw "data.shape.js: shape schema not yet initialized, datasource not fetched?"

            if(!self.attributes.shapeType || self.attributes.shapeType == "svg") {
                var shape = recline.Template.Shapes[this._shapeName(fieldValue)];
                if(shape == null)
                    throw "data.shape.js: shape [" +  this._shapeName(fieldValue) + "] not defined in template.shapes";
                return  shape(fieldColor, isNode, isSVG);
            } else if( self.attributes.shapeType == "text") {
                return this._shapeName(this._shapeName(fieldValue));
            } else if( self.attributes.shapeType == "image") {
                return '<img src="' + this._shapeName(fieldValue) + '" class="shape_image">';
            } else {
                throw "data.shape.js: unsupported shapeType ["+ self.attributes.shapeType  +"]";
            }

        },

        _shapeName: function(fieldValue) {
            var self=this;

            // find the correct shape, limits must be ordered
            if(self.attributes.limitType && this.attributes.limitType == "fixedLimits") {
                var shape = self.attributes.shapes[0];


                for(var i=1;i<this.attributes.limits.length;i++) {
                    if(fieldValue >= this.attributes.limits[i-1]
                        && fieldValue < this.attributes.limits[i]) {
                        shape = self.attributes.shapes[i];
                        break;
                    }
                }

                return shape;
            } else
                return self.schema[fieldValue];
        },


        getRecordsArray: function(dataset) {
            var self=this;
            var ret = [];

            if(dataset.dataset.isFieldPartitioned && dataset.dataset.isFieldPartitioned(dataset.field, dataset.type))   {
                var fields = dataset.dataset.getPartitionedFields(dataset.field);
            _.each(dataset.dataset.getRecords(dataset.type), function(d) {
                _.each(fields, function (field) {
                    ret.push(d.attributes[field.id]);
                });
            });
            }
            else{
                var  fields = [dataset.field];;
                _.each(dataset.dataset.getRecords(dataset.type), function(d) {
                    _.each(fields, function (field) {
                        ret.push(d.attributes[field]);
                    });
                });
            }



            return ret;
        },



        limits: {
            distinct: function(data) {
                var tmp = {};
                _.each(_.uniq(data), function(d, index) {
                    tmp[d]=recline.Data.Transform.getFieldHash(d);
                });
                return data;
            }

        }

    })

    my.ShapeSchema.addShapesToTerms = function (field, terms, shapeSchema) {
        _.each(terms, function (t) {

            // assignment of color schema to fields
            if (shapeSchema) {
                _.each(shapeSchema, function (d) {
                    if (d.field === field)
                        t.shape = d.schema.getShapeFor(t.term, t.color, false, false);
                })
            }
        });
    };

}(jQuery, this.recline.Data));
this.recline = this.recline || {};
this.recline.Data = this.recline.Data || {};

(function ($, my) {
// adapted from https://github.com/harthur/costco. heather rules

    my.StateManagement = {};


    my.StateManagement.State = Backbone.Model.extend({
        constructor: function State() {
            Backbone.Model.prototype.constructor.apply(this, arguments);
        },

        // ### initialize
        initialize: function () {
            var self = this;


            _.each(self.attributes.models, function (c) {
                c.ds.queryState.bind("change",
                    function () {
                        self.setState(self.attributes.stateName, c.ds.queryState, c.field, self)
                    })
                c.ds.queryState.bind("selection:change",
                    function () {
                        self.setState(self.attributes.stateName, c.ds.queryState, c.field, self)
                    })
            });

            var state = my.StateManagement.getState(self.attributes.stateName);

            // if a state is present apply it to all models
            if (state) {
                _.each(self.attributes.models, function (c) {
                    _.each(state.filters, function (f) {
                        c.ds.queryState.setFilter(self.mappingField(f, self.attributes.mappingField, c.field ));
                    });
                    _.each(state.selections, function (s) {
                        c.ds.queryState.setSelection(self.mappingField(s, self.attributes.mappingField, c.field));
                    });


                });
            }

        },

        mappingField: function (filter, fieldFrom, fieldTo) {
            var self=this;

            // DON'T CHANGE MAPPING IF FIELDS IS CORRECT
            if(filter.field != fieldFrom)
                return filter;

            var f = _.clone(filter);
            f.field = fieldTo;

            return f;

        },

        applySelectionToFilters: function (models) {
            var self = this;
            var state = my.StateManagement.getState(self.attributes.stateName);
            if (state) {
                _.each(models, function (f) {
                    _.each(state.selections, function (s) {
                        f.ds.queryState.setFilter(self.mappingField(s, self.attributes.mappingField, f.field));
                    });


                })
            }

        },

        setState: function (stateName, queryState, field, self) {
            var filters = _.filter(queryState.attributes.filters, function(f) { return f.field ==  field} )
            var selections = _.filter(queryState.attributes.selections, function(f) { return f.field ==  field} )


            filters = _.map(filters, function(f) {
                return self.mappingField(f, field, self.attributes.mappingField); });
            selections = _.map(selections, function(f) {
                return self.mappingField(f, field, self.attributes.mappingField); });


            $.cookie("recline.extensions.statemanagement." + stateName, JSON.stringify({filters: filters, selections: selections}), {  path: '/' });
        }
    });


    my.StateManagement.getState = function (name) {
        var res = $.cookie("recline.extensions.statemanagement." + name);
        if (res)
            return JSON.parse(res);

        return null;
    };


}(jQuery, this.recline.Data))
this.recline = this.recline || {};
this.recline.Template = this.recline.Template || {};
this.recline.Template.Shapes = this.recline.Template.Shapes || {};

(function($, my) {

   my.Shapes = {
        circle: function(color, isNode, isSVG) {
            var template = '<circle cx="100" cy="50" r="40" stroke="black" stroke-width="2" fill="{{color}}"/>';

            var data = {color: color};

            return my._internalDataConversion(isNode, isSVG, template, data );


        },
       empty: function(color, isNode, isSVG) { my._internalDataConversion(isNode, isSVG,  ""); }
   };

   my._internalDataConversion = function(isNode, isSVG, mustacheTemplate, mustacheData) {
       if(isSVG) {
           mustacheTemplate = "<svg>"+ mustacheTemplate +"</svg>";
       }
       var res =  Mustache.render(mustacheTemplate, mustacheData);

        if(isNode)
            return jQuery(res);
        else
            return res;
   }

}(jQuery, this.recline.Template));
this.recline = this.recline || {};
this.recline.Backend = this.recline.Backend || {};
this.recline.Backend.Jsonp = this.recline.Backend.Jsonp || {};

(function ($, my) {
    my.__type__ = 'Jsonp';
    // Timeout for request (after this time if no response we error)
    // Needed because use JSONP so do not receive e.g. 500 errors
    my.timeout = 30000;

    // ## load
    //
    // Load data from a URL
    //
    // Returns array of field names and array of arrays for records

    //my.queryStateInMemory = new recline.Model.Query();
    //my.queryStateOnBackend = new recline.Model.Query();

    // todo has to be merged with query (part is in common)
    my.fetch = function (dataset) {

        console.log("Fetching data structure " + dataset.url);

        var data = {onlydesc:"true"};
        return requestJson(dataset, data);

    };

    my.query = function (queryObj, dataset) {


        var data = buildRequestFromQuery(queryObj);
        console.log("Querying jsonp backend [" + (dataset.id ? dataset.id : dataset.url) +"] for ");
        console.log(data);
        return requestJson(dataset, data, queryObj);

    };


    function requestJson(dataset, data, queryObj) {
        var dfd = $.Deferred();

        var jqxhr = $.ajax({
            url:dataset.url,
            dataType:'jsonp',
            jsonpCallback:dataset.id,
            data:data,
            cache:true
        });

        _wrapInTimeout(jqxhr).done(function (results) {

            // verify if returned data is not an error
            if (results.results.length != 1 || results.results[0].status.code != 0) {
                console.log("Error in fetching data: " + results.results[0].status.message + " Statuscode:[" + results.results[0].status.code + "] AdditionalInfo:[" + results.results[0].status.additionalInfo + "]");
                dfd.reject(results.results[0].status);
            } else 
            	dfd.resolve(_handleJsonResult(results.results[0].result, queryObj));
        })
            .fail(function (arguments) {
                dfd.reject(arguments);
            });

        return dfd.promise();

    };




    function _handleJsonResult(data, queryObj) {
        if (data.data == null) {
            return {
                fields:_handleFieldDescription(data.description),
                useMemoryStore:false
            }
        }
        else {
            var fields = _handleFieldDescription(data.description);

            var facets = [];
            if(queryObj)
                var facets = recline.Data.Faceting.computeFacets(data.data, queryObj);

            return {
                hits:_normalizeRecords(data.data, fields),
                fields:fields,
                facets:facets,
                useMemoryStore:false,
                total:data.data.length
            }
        }

    }

    ;


    // convert each record in native format
    // todo verify if could cause performance problems
    function _normalizeRecords(records, fields) {

        _.each(fields, function (f) {
            if (f != "string")
                _.each(records, function (r) {
                    r[f.id] = recline.Data.FormattersMoviri[f.type](r[f.id]);
                })
        });

        return records;

    }

    ;


    // todo should be in backend
    function getDate(temp) {
        var tmp = new Date();

        var dateStr = padStr(temp.getFullYear()) + "-" +
            padStr(1 + temp.getMonth()) + "-" +
            padStr(temp.getDate()) + " " +
            padStr(temp.getHours()) + ":" +
            padStr(temp.getMinutes()) + ":" +
            padStr(temp.getSeconds());
        return dateStr;
    }

    function padStr(i) {
        return (i < 10) ? "0" + i : "" + i;
    }


    function buildRequestFromQuery(queryObj) {

        var filters = queryObj.filters;
        var data = [];
        var multivsep = "|";


        // register filters
        var filterFunctions = {
            term:function term(filter) {
                var parse = dataParsers[filter.fieldType];
                var value = filter.field;
                var term = parse(filter.term);

                return (value + " eq " + term);
            }, // field = value
            termAdvanced:function termAdvanced(filter) {
                var parse = dataParsers[filter.fieldType];
                var value = filter.field;
                var term = parse(filter.term);
                var operator = filter.operator;

                return (value + " " + operator + " " + term);
            }, // field (operator) value
            range:function range(filter) {
                var parse = dataParsers[filter.fieldType];
                var value = filter.field;
                var start = parse(filter.start);
                var stop = parse(filter.stop);
                return (value + " bw " + start + multivsep + stop);

            }, // field > start and field < end
            list:function list(filter) {
                var parse = dataParsers[filter.fieldType];
                var value = filter.field;
                var list = filter.list;

                var ret = value + " in ";
                for (var i in list) {
                    if (i > 0)
                        ret = ret + multivsep;

                    ret = ret + list[i];
                }

                return ret;

            }
        };

        var dataParsers = {
            number:function (e) {
                return parseFloat(e, 10);
            },
            string:function (e) {
                return e.toString()
            },
            date:function (e) {
                var tmp = new Date(e);
                //console.log("---> " + e  + " ---> "+ getDate(tmp)) ;
                return getDate(tmp);

                // return new Date(e).valueOf()
            },
            integer:function (e) {
                return parseInt(e);
            }
        };

        for (var i = 0; i < filters.length; i++) {
            data.push(filterFunctions[filters[i].type](filters[i]));
        }

        // build sort options
        var res = "";

        _.each(queryObj.sort, function (sortObj) {
            if (res.length > 0)
                res += ";"

            var fieldName = sortObj.field;
            res += fieldName;
            if (sortObj.order) {
                res += ":" + sortObj.order;
            }

        });


        // filters definitions


        var outdata = {};
        if (data.length > 0)
            outdata["filters"] = data.toString();

        if (res.length > 0)
            outdata["orderby"] = res;

        return outdata;

    }


    // ## _wrapInTimeout
    //
    // Convenience method providing a crude way to catch backend errors on JSONP calls.
    // Many of backends use JSONP and so will not get error messages and this is
    // a crude way to catch those errors.
    var _wrapInTimeout = function (ourFunction) {
        var dfd = $.Deferred();
        var timer = setTimeout(function () {
            dfd.reject({
                message:'Request Error: Backend did not respond after ' + (my.timeout / 1000) + ' seconds'
            });
        }, my.timeout);
        ourFunction.done(function (arguments) {
            clearTimeout(timer);
            dfd.resolve(arguments);
        })
            .fail(function (arguments) {
                clearTimeout(timer);
                dfd.reject(arguments);
            })
        ;
        return dfd.promise();
    }

    function _handleFieldDescription(description) {

        var dataMapping = {
            STRING:"string",
            DATE:"date",
            INTEGER:"integer",
            DOUBLE:"number"
        };


        var res = [];
        for (var k in description) {

            res.push({id:k, type:dataMapping[description[k]]});
        }

        return res;
    }


}(jQuery, this.recline.Backend.Jsonp));
this.recline = this.recline || {};
this.recline.Backend = this.recline.Backend || {};
this.recline.Backend.JsonpMemoryStore = this.recline.Backend.JsonpMemoryStore || {};

(function ($, my) {
    my.__type__ = 'JsonpMemoryStore';
    // Timeout for request (after this time if no response we error)
    // Needed because use JSONP so do not receive e.g. 500 errors
    my.timeout = 30000;

    // ## load
    //
    // Load data from a URL
    //
    // Returns array of field names and array of arrays for records


    my.fetch = function (dataset) {

        console.log("Fetching data structure " + dataset.url);

        // var data = {onlydesc:"true"}; due to the fact that we use memory store we need to get all data even in first fetch
        return requestJson(dataset, "fetch", {});

    };

    my.query = function (queryObj, dataset) {


        var data = buildRequestFromQuery(queryObj);
        console.log("Querying JsonpMemoryStore backend for ");
        console.log(data);
        return requestJson(dataset, "query", data, queryObj);

    };


    function requestJson(dataset, requestType, data, queryObj) {
        var dfd = $.Deferred();

        var jqxhr = $.ajax({
            url:dataset.url,
            dataType:'jsonp',
            jsonpCallback:dataset.id,
            data:data,
            cache:true
        });

        _wrapInTimeout(jqxhr).done(function (results) {

            // verify if returned data is not an error
            if (results.results.length != 1 || results.results[0].status.code != 0) {
                console.log("Error in fetching data: " + results.results[0].status.message + " Statuscode:[" + results.results[0].status.code + "] AdditionalInfo:[" + results.results[0].status.additionalInfo + "]");
                dfd.reject(results.results[0].status);
            } else
                dfd.resolve(_handleJsonResult(results.results[0].result, queryObj, requestType));
        })
            .fail(function (arguments) {
                dfd.reject(arguments);
            });

        return dfd.promise();

    }

    ;


    function _handleJsonResult(data, queryObj, requestType) {
        if (data.data == null) {
            return {
                fields:_handleFieldDescription(data.description),
                useMemoryStore:true
            }
        }
        else {
            var fields = _handleFieldDescription(data.description);
            var facets = [];
            if (queryObj)
                var facets = recline.Data.Faceting.computeFacets(data.data, queryObj);

            if (requestType == "fetch") {
                return {
                    records:_normalizeRecords(data.data, fields),
                    fields:fields,
                    facets:facets,
                    useMemoryStore:true,
                    total:data.data.length
                }
            } else {
                return {
                    hits:_normalizeRecords(data.data, fields),
                    fields:fields,
                    facets:facets,
                    useMemoryStore:true,
                    total:data.data.length
                }
            }
        }

    }

    ;


    // convert each record in native format
    // todo verify if could cause performance problems
    function _normalizeRecords(records, fields) {

        _.each(fields, function (f) {
            if (f != "string")
                _.each(records, function (r) {
                    r[f.id] = recline.Data.FormattersMoviri[f.type](r[f.id]);
                })
        });

        return records;

    }

    ;


    // todo should be in backend
    function getDate(temp) {
        var tmp = new Date();

        var dateStr = padStr(temp.getFullYear()) + "-" +
            padStr(1 + temp.getMonth()) + "-" +
            padStr(temp.getDate()) + " " +
            padStr(temp.getHours()) + ":" +
            padStr(temp.getMinutes()) + ":" +
            padStr(temp.getSeconds());
        return dateStr;
    }

    function padStr(i) {
        return (i < 10) ? "0" + i : "" + i;
    }


    function buildRequestFromQuery(queryObj) {

        var filters = queryObj.filters;
        var data = [];
        var multivsep = "|";


        // register filters
        var filterFunctions = {
            term:function term(filter) {
                var parse = dataParsers[filter.fieldType];
                var value = filter.field;
                var term = parse(filter.term);

                return (value + " eq " + term);
            }, // field = value
            termAdvanced:function termAdvanced(filter) {
                var parse = dataParsers[filter.fieldType];
                var value = filter.field;
                var term = parse(filter.term);
                var operator = filter.operator;

                return (value + " " + operator + " " + term);
            }, // field (operator) value
            range:function range(filter) {
                var parse = dataParsers[filter.fieldType];
                var value = filter.field;
                var start = parse(filter.start);
                var stop = parse(filter.stop);
                return (value + " lte " + stop + "," + value + " gte " + start);

            }, // field > start and field < end
            list:function list(filter) {
                var parse = dataParsers[filter.fieldType];
                var value = filter.field;
                var list = filter.list;

                var ret = value + " bw ";
                for (var i in filter.list) {
                    if (i > 0)
                        ret = ret + multivsep;

                    ret = ret + list[i];
                }

                return ret;

            }
        };

        var dataParsers = {
            number:function (e) {
                return parseFloat(e, 10);
            },
            string:function (e) {
                return e.toString()
            },
            date:function (e) {
                var tmp = new Date(e);
                //console.log("---> " + e  + " ---> "+ getDate(tmp)) ;
                return getDate(tmp);

                // return new Date(e).valueOf()
            },
            integer:function (e) {
                return parseInt(e);
            }
        };

        for (var i = 0; i < filters.length; i++) {
            data.push(filterFunctions[filters[i].type](filters[i]));
        }

        // build sort options
        var res = "";

        _.each(queryObj.sort, function (sortObj) {
            if (res.length > 0)
                res += ";"

            var fieldName = sortObj.field;
            res += fieldName;
            if (sortObj.order) {
                res += ":" + sortObj.order;
            }

        });


        // filters definitions


        var outdata = {};
        if (data.length > 0)
            outdata["filters"] = data.toString();

        if (res.length > 0)
            outdata["orderby"] = res;

        return outdata;

    }


    // ## _wrapInTimeout
    //
    // Convenience method providing a crude way to catch backend errors on JSONP calls.
    // Many of backends use JSONP and so will not get error messages and this is
    // a crude way to catch those errors.
    var _wrapInTimeout = function (ourFunction) {
        var dfd = $.Deferred();
        var timer = setTimeout(function () {
            dfd.reject({
                message:'Request Error: Backend did not respond after ' + (my.timeout / 1000) + ' seconds'
            });
        }, my.timeout);
        ourFunction.done(function (arguments) {
            clearTimeout(timer);
            dfd.resolve(arguments);
        })
            .fail(function (arguments) {
                clearTimeout(timer);
                dfd.reject(arguments);
            })
        ;
        return dfd.promise();
    }

    function _handleFieldDescription(description) {

        var dataMapping = {
            STRING:"string",
            DATE:"date",
            INTEGER:"integer",
            DOUBLE:"number"
        };


        var res = [];
        for (var k in description) {

            res.push({id:k, type:dataMapping[description[k]]});
        }

        return res;
    }


}(jQuery, this.recline.Backend.JsonpMemoryStore));
this.recline = this.recline || {};
this.recline.Backend = this.recline.Backend || {};
this.recline.Backend.ParallelUnionBackend = this.recline.Backend.ParallelUnionBackend || {};

(function ($, my) {
    // Behaviour is used to choose the content of the query to be executed on relative backend
    // if behaviour is not specified all different orid will be executed on backend[1] in parallel
    // query item must must have a "orid" attributes
    // e.g. {field: "fieldname", type:"term", term:"fieldvalue", fieldType:"string", orid="year" };

    /*BackendConfigurationExample =  {
        backends:
            [{
                    id:1,
                    backend:"Jsonp",
                    params:{ url:"http://" }
                }],
        behaviour:
        [
            {
                orid:"year",
                backend:1
            },
            {
                orid:"month",
                backend:1
            },
            {
                orid:"week",
                backend:1
            },
            {
                orid:"day",
                backend:1
            }
        ]
    }*/

    // common sono i valori non in or
    // il field deve essere singolo term
    // il valore del field determina il backend
    // passare id del dataset nei params

    my.__type__ = 'ParallelUnionBackend';

    my.deferreds = function(dataset) {
        var backendsFetch = [];
        _.each(dataset.backendConfiguration.backends, function(b) {
            b["instance"] = my._backendFromString(b.backend);
            var deferred = b.instance.fetch(b["props"]);
            deferred.done(function(res) {
                _.extend(data, res);
            });
            backendsFetch.push(deferred) ;
        });
        return backendsFetch;
    },

    my.fetch = function (dataset) {
        var dfd = new $.Deferred();
        var data = { fields: [], records: [], useMemoryStore: false};

        var backendsFetch = [];
        _.each(dataset.backendConfiguration.backends, function(b) {
            b["instance"] = my._backendFromString(b.backend);
            var deferred = b.instance.fetch(b["props"]);
            deferred.done(function(res) {
               if(data.useMemoryStore) {
                   data["useMemoryStore"] =  true;
               }
                // make the union of fields
                _.each(res.fields, function(f) {
                    if(!_.find(data.fields, function(ff) { return f.id==ff.id })) {
                        data.fields.push(f);
                    }
                });

            });
            backendsFetch.push(deferred) ;
        });

        $.when.apply(window, backendsFetch).done(function() {
            dfd.resolve(data).fail(my.errorOnFetching);
        });

        return dfd.promise();
    };

    my.query = function (queryObj, dataset) {
        var dfd = new $.Deferred();
        var data = { fields: [], hits: [], useMemoryStore: false, facets: []};

        var backendsFetch = [];

        if(dataset.backendConfiguration.backendChoser) {
            var be = dataset.backendConfiguration.backendChoser(queryObj);
            _.each(be, function(b) {
                var query = _.clone(queryObj);
                query.filters = b.filters;
                b["instance"] = my._backendFromString(b.backend.backend);
                var deferred = b.instance.query(query, b.backend["props"]);
                deferred.done(function(res) {
                    if(data.useMemoryStore) {
                        data["useMemoryStore"] =  true;
                    }
                    // make the union of fields
                    _.each(res.fields, function(f) {
                        if(!_.find(data.fields, function(ff) { return f.id==ff.id })) {
                            data.fields.push(f);
                        }
                    });
                    data.hits = $.merge(data.hits, res.hits);
                    data.facets = $.merge(data.facets, res.facets);
                    data["total"] = data.hits.length;

                });
                backendsFetch.push(deferred) ;
            });

        } else {
            _.each(dataset.backendConfiguration.backends, function(b) {
                b["instance"] = my._backendFromString(b.backend);
                var deferred = b.instance.query(queryObj, b["props"]);
                deferred.done(function(res) {
                    if(data.useMemoryStore) {
                        data["useMemoryStore"] =  true;
                    }
                    // make the union of fields
                    _.each(res.fields, function(f) {
                        if(!_.find(data.fields, function(ff) { return f.id==ff.id })) {
                            data.fields.push(f);
                        }
                    });
                    data.hits = $.merge(data.hits, res.hits);
                    data.facets = $.merge(data.facets, res.facets);
                    data["total"] = data.hits.length;

                });
                backendsFetch.push(deferred) ;
            });

        }


        $.when.apply(window, backendsFetch).done(function() {
            dfd.resolve(my.prepareResults(data, dataset.backendConfiguration.result)).fail(my.errorOnFetching);
        });

        return dfd.promise();
    };


    // if results myst be aggregated
    // a group function is applied and then for each group the sum is calculated
    my.prepareResults = function(data, resulttype) {
        if(resulttype.type == "union") {
            return data;
        }
        else if(resulttype.type == "sum") {
            var groupBy = resulttype.groupBy;
            var res = _.groupBy(data.hits, groupBy);
            var ret = [];
            _.each(res, function(group, iterator) {
                var r = {};
                r[groupBy] = iterator;
                _.each(group, function(record){
                    _.each(resulttype.fields, function(field, itField) {
                        if(r[field])
                            r[field] = r[field] + record[field];
                        else
                            r[field] = record[field];
                    })
                })
                ret.push(r);
            })
            data.hits=ret;
            return data;
        }
    }

    my.errorOnFetching = function() {
        return {
            message:'Request Error: error on fetching union parallel backends'
        };
    };

    my._backendFromString = function(backendString) {
        var backend = null;
        if (recline && recline.Backend) {
            _.each(_.keys(recline.Backend), function(name) {
                if (name.toLowerCase() === backendString.toLowerCase()) {
                    backend = recline.Backend[name];
                }
            });
        }
        return backend;
    }


}(jQuery, this.recline.Backend.ParallelUnionBackend));
this.recline = this.recline || {};
this.recline.View = this.recline.View || {};

(function ($, view) {

    "use strict";

    view.Composed = Backbone.View.extend({
        templates: {
            vertical: '<div id="{{uid}}">' +
                '<div class="composedview_table">' +
                '<div class="c_group c_header">' +
                '<div class="c_row">' +
                '<div class="cell cell_empty"></div>' +
                '{{#dimensions}}' +
                '<div class="cell cell_name"><div class="title" style="float:left">{{term_desc}}</div><div class="shape" style="float:left">{{{shape}}}</div></div>' +
                '{{/dimensions}}' +
                '</div>' +
                '</div>' +
                '<div class="c_group c_body">' +
                '<div class="c_row"><div class="cell cell_empty"/>{{{noData}}}</div>' +
                '{{#measures}}' +
                '<div class="c_row">' +
                '<div class="cell cell_title"><div style="white-space:nowrap;"><div class="rawhtml" style="vertical-align:middle;float:left">{{{rawhtml}}}</div><div style="vertical-align:middle;float:left"><div class="title">{{{title}}}</div><div class="subtitle">{{{subtitle}}}</div></div><div class="shape" style="vertical-align:middle;float:left">{{shape}}</div></div></div>' +
                '{{#dimensions}}' +
                '<div class="cell cell_graph" id="{{#getDimensionIDbyMeasureID}}{{measure_id}}{{/getDimensionIDbyMeasureID}}" term="{{measure_id}}"></div>' +
                '{{/dimensions}}' +
                '</div>' +
                '{{/measures}}' +
                '</div>' +
                '<div class="c_group c_footer"></div>' +
                '</div>' +
                '</div>',

            horizontal: '<div id="{{uid}}">' +
                '<table><tr><td>' +
                '<div class="composedview_table">' +
                '<div class="c_group c_header">' +
                '<div class="c_row">' +
                '<div class="cell cell_empty"></div>' +
                '{{#measures}}' +
          //      '<div class="cell cell_title"><div style="white-space:nowrap;"><div class="rawhtml" style="vertical-align:middle;float:left">{{{rawhtml}}}</div><div style="float:left;vertical-align:middle"><div class="title">{{{title}}}</div><div class="subtitle">{{{subtitle}}}</div></div><div class="shape" style="float:left;vertical-align:middle">{{shape}}</div></div></div>' +
                '<div class="cell cell_title"><div style="white-space:nowrap;"><div class="rawhtml" style="vertical-align:middle;float:left">{{{rawhtml}}}</div><div style="float:left;vertical-align:middle"><div class="title"><a class="link_tooltip" href="#" data-toggle="tooltip" title="{{{subtitle}}}">{{{title}}}</a></div></div><div class="shape" style="float:left;vertical-align:middle">{{shape}}</div></div></div>' +
                '{{/measures}}' +
                '</div>' +
                '</div>' +
                '<div class="c_group c_body">' +
                '{{#dimensions}}' +
	                '<div class="c_row">' +
	                	'<div class="cell cell_name"><div class="title" style="float:left">{{term_desc}}</div><div class="shape" style="float:left">{{{shape}}}</div></div>' +
	                	'{{#measures}}' +
	                		'<div class="cell cell_graph" id="{{viewid}}"></div>' +
	                	'{{/measures}}' +
	                '</div>' +
                '{{/dimensions}}' +
	                '<div class="c_row c_totals">' +
		            	'{{#dimensions_totals}}' +
		            		'<div class="cell cell_name"><div class="title" style="float:left">{{term_desc}}</div><div class="shape" style="float:left">{{{shape}}}</div></div>' +
	            			'{{#measures}}' +
	            				'<div class="cell cell_graph" id="{{viewid}}"></div>' +
	            			'{{/measures}}' +	            		
		            	'{{/dimensions_totals}}' +
		            '</div>' +
                '</div>' +                
                '</div>' +
                '</td></tr><tr><td>{{{noData}}}</td></tr></table>' +
                '</div>'
        },

        // if total is present i need to wait for both redraw events
        redrawSemaphore: function (type, self) {

            if (!self.semaphore) {
                self.semaphore = "";
            }
            if (self.options.modelTotals) {
                if (type == "model") {
                    if (self.semaphore == "totals") {
                        self.semaphore = "";
                        self.redraw();
                    } else {
                        self.semaphore = "model";
                    }
                } else {
                    if (self.semaphore == "model") {
                        self.semaphore = "";
                        self.redraw();
                    } else {
                        self.semaphore = "totals";
                    }
                }
            } else {
                self.redraw();
            }
        },

        initialize: function (options) {
            var self = this;
            this.el = $(this.el);
            _.bindAll(this, 'render', 'redraw');


            this.model.bind('change', this.render);
            this.model.fields.bind('reset', this.render);
            this.model.fields.bind('add', this.render);

            this.model.bind('query:done', function () {
                self.redrawSemaphore("model", self)
            });


            if (this.options.modelTotals) {
                this.options.modelTotals.bind('change', this.render);
                this.options.modelTotals.fields.bind('reset', this.render);
                this.options.modelTotals.fields.bind('add', this.render);

                this.options.modelTotals.bind('query:done', function () {
                    self.redrawSemaphore("totals", self)
                });



            }

            this.uid = options.id || ("composed_" + new Date().getTime() + Math.floor(Math.random() * 10000)); // generating an unique id for the chart

            _.each(this.options.measures, function (m, index) {
                self.options.measures[index]["measure_id"] = new Date().getTime() + Math.floor(Math.random() * 10000);
            });


            //contains the array of views contained in the composed view
            this.views = [];

            //if(this.options.template)
            //    this.template = this.options.template;

        },

        render: function () {
            var self = this;
            var graphid = "#" + this.uid;

            if (self.graph)
                jQuery(graphid).empty();

        },

        getViewFunction: function () {
            return function (measureID) {
                var measure = _.find(this.measures, function (f) {
                    return f.measure_id == measureID;
                });
                return measure.viewid;
            }
        },

        redraw: function () {
            var self = this;


            self.dimensions = [ ];
            self.noData = "";

            // if a dimension is defined I need a facet to identify all possibile values
            if (self.options.groupBy) {
                var facets = this.model.getFacetByFieldId(self.options.groupBy);
                var field = this.model.fields.get(self.options.groupBy);

                if(!field)
                    throw "ComposedView: unable to find groupBy field ["+ self.options.groupBy +"] in model ["+this.model.id+"]";

                if (!facets) {
                    throw "ComposedView: no facet present for groupby field [" + self.options.groupBy + "]. Define a facet on the model before view render";
                }

                if (facets.attributes.terms.length == 0 && !self.options.modelTotals)
                    self.noData = new recline.View.NoDataMsg().create2();

                else _.each(facets.attributes.terms, function (t) {
                    if (t.count > 0) {
                        var uid = (new Date().getTime() + Math.floor(Math.random() * 10000)); // generating an unique id for the chart

                        var term_desc;
                        if (self.options.rowTitle)
                            term_desc = self.options.rowTitle(t);
                        else
                            term_desc = t.term;

                        var dim = {term: t.term, term_desc: term_desc, id_dimension: uid, shape: t.shape};

                        dim["getDimensionIDbyMeasureID"] = function () {
                            return function (measureID) {
                                var measure = _.find(this.measures, function (f) {
                                    return f.measure_id == measureID;
                                });
                                return measure.viewid;
                            }
                        };

                        self.dimensions.push(self.addFilteredMeasuresToDimension(dim, field));
                    }
                })



            } else {
                var uid = (new Date().getTime() + Math.floor(Math.random() * 10000)); // generating an unique id for the chart
                var dim;

                if (self.options.type == "groupByRecord")
                    dim = self.addMeasuresToDimension({id_dimension: uid});
                else
                    dim = self.addMeasuresToDimensionAllModel({id_dimension: uid}, self.options.measures);

                _.each(dim, function (f, index) {
                    f["getDimensionIDbyMeasureID"] = self.getViewFunction;
                    dim[index] = f;
                })

                self.dimensions = dim;
            }
            this.measures = this.options.measures;


            if (self.options.modelTotals) {
                var data = [];
                var uid = (new Date().getTime() + Math.floor(Math.random() * 10000));
                var dim = {id_dimension: uid, measures: data};

                if(self.options.titleTotals) {
                    dim["term_desc"] = self.options.titleTotals;
                }

                _.each(self.options.measures, function (d) {

                    var val = {
                        view: d.view,
                        viewid: new Date().getTime() + Math.floor(Math.random() * 10000),
                        measure_id: d.measure_id,
                        props: d.props,
                        dataset: self.options.modelTotals,
                        title: d.title,
                        subtitle: d.subtitle,
                        rawhtml: d.rawhtml};
                    data.push(val);

                });

                self.dimensions_totals = [dim];
            }


            var tmpl = this.templates.vertical;
            if (this.options.template)
                tmpl = this.templates[this.options.template];
            if (this.options.customTemplate)
                tmpl = this.options.customTemplate;

            var out = Mustache.render(tmpl, self);
            this.el.html(out);

            this.attachViews();

            if (self.options.postRender){
            	self.options.postRender.call();
            }            
            // force a resize to ensure that contained object have the correct amount of width/height
            this.el.trigger('resize');


        },

        attachViews: function () {
            var self = this;
            self.views = []

            _.each(self.dimensions, function (dim) {
                _.each(dim.measures, function (m) {
                    var $el = $('#' + m.viewid);
                    m.props["el"] = $el;
                    m.props["model"] = m.dataset;
                    var view = new recline.View[m.view](m.props);
                    self.views.push(view);

                    if (typeof(view.render) != 'undefined') {
                        view.render();
                    }
                    if (typeof(view.redraw) != 'undefined') {
                        view.redraw();
                    }

                })
            })

            _.each(self.dimensions_totals, function (dim) {
                _.each(dim.measures, function (m) {
                    var $el = $('#' + m.viewid);
                    m.props["el"] = $el;
                    m.props["model"] = m.dataset;
                    var view = new recline.View[m.view](m.props);
                    self.views.push(view);

                    if (typeof(view.render) != 'undefined') {
                        view.render();
                    }
                    if (typeof(view.redraw) != 'undefined') {
                        view.redraw();
                    }

                })
            })
        },

        /*
         for each facet pass to the view a new model containing all rows with same facet value
         */
        addFilteredMeasuresToDimension: function (currentRow, dimensionField) {
            var self = this;

            // dimension["data"] = [view]
            // a filtered dataset should be created on the original data and must be associated to the view
            var filtereddataset = new recline.Model.FilteredDataset({dataset: self.model});

            var filter = {field: dimensionField.get("id"), type: "term", term: currentRow.term, term_desc: currentRow.term, fieldType: dimensionField.get("type") };
            filtereddataset.queryState.addFilter(filter);
            filtereddataset.query();
            // foreach measure we need to add a view do the dimension

            var data = [];
            _.each(self.options.measures, function (d) {
                var val = {
                    view: d.view,
                    viewid: new Date().getTime() + Math.floor(Math.random() * 10000),
                    measure_id: d.measure_id,
                    props: d.props,
                    dataset: filtereddataset,
                    title: d.title,
                    subtitle: d.subtitle,
                    rawhtml: d.rawhtml
                };

                data.push(val);


            });


            currentRow["measures"] = data;
            return currentRow;

        },

        /*
         for each record pass to the view a new model containing only that row
         */

        addMeasuresToDimension: function (currentRow) {
            var self = this;
            var ret = [];


            _.each(self.model.records.models, function (r) {
                var data = [];
                _.each(self.options.measures, function (d) {


                    var model = new recline.Model.Dataset({ records: [r.toJSON()], fields: r.fields.toJSON(), renderer: self.model.attributes.renderer});

                    var val = {
                        view: d.view,
                        viewid: new Date().getTime() + Math.floor(Math.random() * 10000),
                        measure_id: d.measure_id,
                        props: d.props,
                        dataset: model,
                        title: d.title,
                        subtitle: d.subtitle,
                        rawhtml: d.rawhtml};
                    data.push(val);


                });
                var currentRec = {measures: data, id_dimension: currentRow.id_dimension};
                ret.push(currentRec);
            });


            return ret;

        },

        /*
         pass to the view all the model
         */

        addMeasuresToDimensionAllModel: function (currentRow, measures, totals) {
            var self = this;

            var data = [];


            _.each(measures, function (d) {
                var view;
                var props;
                if (totals) {
                    view = d.totals.view;
                    if (d.totals.props)
                        props = d.totals.props;
                    else
                        props = {};
                }
                else {
                    view = d.view;
                    props = d.props;
                }


                var val = {
                    view: view,
                    viewid: new Date().getTime() + Math.floor(Math.random() * 10000),
                    measure_id: d.measure_id,
                    props: props,
                    dataset: self.model,
                    title: d.title,
                    subtitle: d.subtitle,
                    rawhtml: d.rawhtml};
                data.push(val);


            });


            currentRow["measures"] = data;
            return [currentRow];

        }


    });
})(jQuery, recline.View);/*jshint multistr:true */

this.recline = this.recline || {};
this.recline.View = this.recline.View || {};

(function ($, my) {

// ## Indicator view for a Dataset 
//
// Initialization arguments (in a hash in first parameter):
//
// * model: recline.Model.Dataset (should be a VirtualDataset that already performs the aggregation
// * state: (optional) configuration hash of form:
//
//        { 
//          series: [{column name for series A}, {column name series B}, ... ],   // only first record of dataset is used
//			format: (optional) format to use (see D3.format for reference)
//        }
//
// NB: should *not* provide an el argument to the view but must let the view
// generate the element itself (you can then append view.el to the DOM.
    my.Indicator = Backbone.View.extend({
        defaults:{
            format:'d'
        },

        compareType:{
            self:this,
            percentage:function (kpi, compare, templates, condensed) {
                var tmpField = new recline.Model.Field({type:"number", format:"percentage"});
                var unrenderedValue = kpi / compare * 100;
                var data = recline.Data.Formatters.Renderers(unrenderedValue, tmpField);
                var template = templates.templatePercentage;
                if (condensed == true)
                	template = templates.templateCondensed;
                
                return {data:data, template:template, unrenderedValue: unrenderedValue, percentageMsg: " % of total: "};
            },
            percentageVariation:function (kpi, compare, templates, condensed) {
                var tmpField = new recline.Model.Field({type:"number", format:"percentage"});
                var unrenderedValue = (kpi-compare) / compare * 100;
                var data = recline.Data.Formatters.Renderers( unrenderedValue, tmpField);
                var template = templates.templatePercentage;
                if (condensed == true)
                	template = templates.templateCondensed;

//                return {data:data, template:template, unrenderedValue: unrenderedValue, percentageMsg: " % variation: "};
                return {data:data, template:template, unrenderedValue: unrenderedValue, percentageMsg: ""};
            },
            nocompare: function (kpi, compare, templates, condensed){
                var template = templates.templateBase;
                if (condensed == true)
                	template = templates.templateCondensed;
            	
                return {data:null, template:template, unrenderedValue:null};
            }


        },

        templates:{
   templateBase:
   '<div class="indicator"> \
      <div class="panel indicator_{{viewId}}"> \
        <div id="indicator_{{viewId}}"> \
			<table class="indicator-table"> \
                <tr class="titlerow"><td></td><td style="text-align: center;" class="title">{{{label}}}</td></tr>    \
                <tr class="descriptionrow"><td></td><td style="text-align: center;" class="description"><small>{{description}}</small></td></tr>    \
                <tr class="shaperow"> \
	   				<td><div class="shape">{{{shape}}}</div> \
	   				<div class="compareshape">{{{compareShape}}}</div> \
	   				</td><td class="value-cell">{{value}}</td></tr>  \
             </table>  \
		</div>\
      </div> \
    </div> ',
    templateBaseCondensed_old:
	'<div class="indicator " style="width:100%;"> \
	    <div class="panel indicator_{{viewId}}" style="width:100%;"> \
    		<div id="indicator_{{viewId}}" class="indicator-container well" style="width:85%;"> \
    			<div style="width:100%;margin-left:5px"> \
	                <div class="value-cell" style="float:left">{{value}}</div> \
    				{{#compareShape}} \
					<div class="compareshape" style="float:right">{{{compareShape}}}</div> \
    				{{/compareShape}} \
	   				{{#shape}} \
	                <div class="shape" style="float:right">{{{shape}}}</div> \
	   				{{/shape}} \
				</div> \
    			<div style="width:100%;padding-top:10px"><hr></div> \
                <div style="text-align:justify;width:100%;margin-right:8px" class="title">{{{label}}}</div>\
			</div> \
	    </div> \
    </div>',
    templateCondensed:
        '<div class="indicator round-border-dark" > \
    	    <div class="panel indicator_{{viewId}}" > \
        		<div id="indicator_{{viewId}}" class="indicator-container" > \
        			<div class="round-border" style="float:left;margin:2px 2px 0px 2px"> \
    					{{#compareShape}} \
    					<div class="compareshape" style="float:left">{{{compareShape}}}</div> \
    					{{/compareShape}} \
						{{#shape}} \
    	                <div class="shape" style="float:left">{{{shape}}}</div> \
    					{{/shape}} \
        				<div class="value-cell" style="float:left">{{value}}</div> \
    				</div> \
                    <div class="title">&nbsp;&nbsp;{{{label}}}</div>\
    			</div> \
    	    </div> \
        </div>'

,
//   templatePercentage:
//   '<div class="indicator"> \
//      <div class="panel indicator_{{viewId}}"> \
//        <div id="indicator_{{viewId}}"> \
//			 <table class="indicator-table"> \
//                <tr class="titlerow"><td></td><td class="title">{{{label}}}</td></tr>    \
//                <tr class="descriptionrow"><td></td><td class="description"><small>{{description}}</small></td></tr>    \
//                <tr class="shaperow"><td><div class="shape">{{{shape}}}</div><div class="compareshape">{{{compareShape}}}</div></td><td class="value-cell">{{value}}</td></tr>  \
//                <tr class="comparerow"><td></td><td class="comparelabel">{{percentageMsg}}<b>{{compareValue}}</b> (<b>{{compareWithValue}}</b>)</td></tr>  \
//             </table>  \
//		</div>\
//      </div> \
//    </div> '
		
templatePercentage:
	   '<div class="indicator"> \
	      <div class="panel indicator_{{viewId}}"> \
	        <div id="indicator_{{viewId}}"> \
				 <div class="indicator-table"> \
	                <div class="titlerow"><span class="title">{{{label}}}</span></div>    \
	                <div class="descriptionrow"><span class="description"><small>{{description}}</small></span></div>    \
	                <div class="shaperow"> \
						<div class="shape">{{{shape}}}</div> \
						<span class="value-cell"> \
							<div style="white-space: nowrap;"> \
								<div class="kpi_value">{{value}}</div> \
								<div class="kpi_compare_shape_container"> \
									<div class="kpi_compare_shape_shape" >{{{compareShape}}}</div> \
									<div class="kpi_compare_shape_msg">{{percentageMsg}}{{compareValue}}</div>\
								</div> \
							</div> </span> \
					</div>  \
	             </div>  \
			</div>\
	      </div> \
	    </div> '
	
        },
        initialize:function (options) {
            var self = this;

            this.el = $(this.el);
            _.bindAll(this, 'render');
            this.uid = options.id || ("" + new Date().getTime() + Math.floor(Math.random() * 10000)); // generating an unique id for the chart

            this.model.bind('query:done', this.render);

        },

        render:function () {
            //console.log("View.Indicator: render");

            var self = this;
            var tmplData = {};
            tmplData["viewId"] = this.uid;
            tmplData.label = this.options.state && this.options.state["label"];

            var kpi = self.model.getRecords(self.options.state.kpi.type);

            var field;
            if (self.options.state.kpi.aggr)
                field = self.model.getField_byAggregationFunction(self.options.state.kpi.type, self.options.state.kpi.field, self.options.state.kpi.aggr);
            else
                field = self.model.getFields(self.options.state.kpi.type).get(self.options.state.kpi.field);

            if (!field)
                throw "View.Indicator: unable to find field [" + self.options.state.kpi.field + "] on model"
                
            var textField = null;
            if (self.options.state.condensed == true && self.options.state.kpi.textField)
        	{
                if (self.options.state.kpi.aggr)
                	textField = self.model.getField_byAggregationFunction(self.options.state.kpi.type, self.options.state.kpi.textField, self.options.state.kpi.aggr);
                else
                	textField = self.model.getFields(self.options.state.kpi.type).get(self.options.state.kpi.textField);

                if (!textField)
                    throw "View.Indicator: unable to find field [" + self.options.state.kpi.textField + "] on model"
        	}

            var kpiValue;


            if (kpi.length > 0) {
                kpiValue = kpi[0].getFieldValueUnrendered(field);
                tmplData["value"] = kpi[0].getFieldValue(field);
                tmplData["shape"] = kpi[0].getFieldShape(field, true, false);
                if (self.options.state.condensed == true && textField){
                	if (self.options.maxLabelLength){ // TODO DOCUMENT the maxLabelLength option
                		var fullText =  kpi[0].getFieldValue(textField);

                		if ( fullText && fullText.length > self.options.maxLabelLength){
                            var truncatedText = fullText.substring(0, self.options.maxLabelLength);
                            tmplData["label"] = '<abbr title="' + fullText + '">'+truncatedText+'...</abbr>';
                		} else {
                			tmplData["label"] = kpi[0].getFieldValue(textField);
                		}                			
                	} else {
                		tmplData["label"] = kpi[0].getFieldValue(textField);	
                	}                	
                }	
            }
            else tmplData["value"] = "N/A";

            var template = this.templates.templateBase;
            if (self.options.state.condensed == true)
            	template = self.templates.templateCondensed;            

            if (self.options.state.compareWith) {
                var compareWithRecord = self.model.getRecords(self.options.state.compareWith.type);

                if(compareWithRecord.length > 0) {
                    var compareWithField;

                    if (self.options.state.kpi.aggr)
                        compareWithField = self.model.getField_byAggregationFunction(self.options.state.compareWith.type, self.options.state.compareWith.field, self.options.state.compareWith.aggr);
                    else
                        compareWithField = self.options.model.getFields(self.options.state.compareWith.type).get(self.options.state.compareWith.field);

                    if (!compareWithField)
                        throw "View.Indicator: unable to find field [" + self.options.state.compareWith.field + "] on model"


                    tmplData["compareWithValue"] = compareWithRecord[0].getFieldValue(compareWithField);
                    var compareWithValue = compareWithRecord[0].getFieldValueUnrendered(compareWithField);

                    var compareValue;

                    var compareValue = self.compareType[self.options.state.compareWith.compareType](kpiValue, compareWithValue, self.templates, self.options.state.condensed);
                    if(!compareValue)
                        throw "View.Indicator: unable to find compareType [" + self.options.state.compareWith.compareType + "]";

                    tmplData["compareValue"] = compareValue.data;

                    if(self.options.state.compareWith.shapes) {
                        if(compareValue.unrenderedValue == 0)
                            tmplData["compareShape"] = self.options.state.compareWith.shapes.constant;
                        else if(compareValue.unrenderedValue > 0)
                            tmplData["compareShape"] = self.options.state.compareWith.shapes.increase;
                        else if(compareValue.unrenderedValue < 0)
                            tmplData["compareShape"] = self.options.state.compareWith.shapes.decrease;
                    }

                    if(compareValue.template)
                        template = compareValue.template;
                }
            }
            if ((tmplData["shape"] == null || typeof tmplData["shape"] == "undefined") 
            	&& (tmplData["compareShape"] == null || typeof tmplData["compareShape"] == "undefined"))
            	tmplData["compareShape"] = " " // ensure the space is filled

            if (this.options.state.description)
                tmplData["description"] = this.options.state.description;
            
            if (compareValue && compareValue.percentageMsg)
            	tmplData["percentageMsg"] = compareValue.percentageMsg; 

            var htmls = Mustache.render(template, tmplData);
            $(this.el).html(htmls);


            //this.$graph = this.el.find('.panel.indicator_' + tmplData["viewId"]);


            return this;
        }






    });


})(jQuery, recline.View);
/*jshint multistr:true */

this.recline = this.recline || {};
this.recline.View = this.recline.View || {};

(function ($, my) {


    my.KartoGraph = Backbone.View.extend({

        template:'<div id="cartograph_{{viewId}}"></div> ',

        rendered: false,
        mapWidth:undefined,
        mapHeight:undefined,

        initialize:function (options) {
            var self = this;

            this.el = $(this.el);
            _.bindAll(this, 'render', 'redraw');

            this.model.bind('change', self.render);
            this.model.fields.bind('reset', self.render);
            this.model.fields.bind('add', self.render);

            this.model.bind('query:done', this.redraw);
            this.model.queryState.bind('selection:done', this.redraw);

            this.uid = "" + new Date().getTime() + Math.floor(Math.random() * 10000); // generating an unique id for the chart
            this.mapWidth = options.state.width // optional. May be undefined
            this.mapHeight = options.state.height // optional. May be undefined

            this.unselectedColor = "#C0C0C0";
            if (this.options.state.unselectedColor)
                this.unselectedColor = this.options.state.unselectedColor;

        },

        render:function () {
            var self = this;
            var tmplData = {};
            tmplData["viewId"] = this.uid;
            var htmls = Mustache.render(this.template, tmplData);
            $(this.el).html(htmls);

            var map_url = this.options.state["svgURI"];
            var layers = this.options.state["layers"];

            self.map = $K.map('#cartograph_' + this.uid, self.mapWidth, self.mapHeight);
            self.map.loadMap(map_url, function (m) {
                _.each(layers, function (d) {
                    m.addLayer(d, self.getEventsForLayer(d));
                });
                self.rendered = true;
                self.updateMap();


            });

            return this;
        },

        redraw:function () {
            var self = this;

            self.updateMap();
        },

        updateMap:function () {
            var self = this;

            if(!self.rendered)
                return;

            var map = self.map;


            // todo verify if it is possibile to divide render and redraw
            // it seams that context is lost after initial load

            var colors = this.options.state["colors"];
            var mapping = this.options.state["mapping"];



            _.each(mapping, function (currentMapping) {
                //build an object that contains all possibile srcShape
                var layer = map.getLayer(currentMapping.destLayer);

                var paths = [];
               _.each(layer.paths, function(currentPath) {
                    paths.push(currentPath.data[currentMapping["destAttribute"]]);
                });

                var filteredResults = self._getDataFor(
                    paths,
                    currentMapping["srcShapeField"],
                    currentMapping["srcValueField"]);

                layer.style(
                    "fill", function (d) {
                        var res = filteredResults[d[currentMapping["destAttribute"]]];

                        // check if current shape is present into results
                           if(res != null)
                                return res.color;
                            else
                                return self.unselectedColor;
                    });
            });


        },


        // todo this is not efficient, a list of data should be built before and used as a filter
        // to avoid arrayscan
        _getDataFor:function (paths, srcShapeField, srcValueField) {
            var self=this;
            var resultType = "filtered";
            if (self.options.useFilteredData !== null && self.options.useFilteredData === false)
                resultType = "original";

            var records = self.model.getRecords(resultType);  //self.model.records.models;
            var srcShapef = self.model.fields.get(srcShapeField);
            var srcValuef = self.model.fields.get(srcValueField);

            var selectionActive = false;
            if (self.model.queryState.isSelected())
                selectionActive = true;

            var res = {};
            _.each(records, function (d) {

                if(_.contains(paths, d.getFieldValueUnrendered(srcShapef))) {
                    var color = self.unselectedColor;
                    if(selectionActive) {
                        if(d.isRecordSelected())
                            color = d.getFieldColor(srcValuef);
                    } else {
                            color = d.getFieldColor(srcValuef);
                    }


                    res[d.getFieldValueUnrendered(srcShapef)] =  {record: d, field: srcValuef, color: color, value:d.getFieldValueUnrendered(srcValuef) };

                }
            });

            return res;
        },

        getEventsForLayer: function(layer) {
            var self=this;
            var ret = {};

            // fiend all fields of this layer
            //  mapping: [{srcShapeField: "state", srcValueField: "value", destAttribute: "name", destLayer: "usa"}],

            var fields = _.filter(this.options.state["mapping"], function(m) {
                return m.destLayer == layer;
            });

            if(fields.length == 0)
                return {};
            if(fields.length > 1)
                throw "view.Kartograph.js: more than one field associated with layer, impossible to link with actions"

            //fields = _.map(fields, function(d) {return d.srcShapeField});

            // find all actions for selection
            var clickEvents = self.getActionsForEvent("selection");

            // filter actions that doesn't contain fields

            var clickActions = _.filter(clickEvents, function(d) {
                return d.mapping.srcField == fields.srcShapeField;
            });


            if(clickActions.length > 0)
            ret["click"] = function(data, path, event) {

                console.log(data);
                _.each(clickActions, function(a) {
                    var params = [];
                    _.each(a.mapping, function(m) {
                       params.push({filter:m.filter,  value: [data[fields[0].destAttribute]]});
                    });

                    a.action._internalDoAction(params, "add");
                });

            };

            return ret;
        },


        getMapping: function(srcField) {
            var self=this;
            var mapping = this.options.state["mapping"];
            return _.filter(mapping, function(d) {
                return d.srcShapeField == srcField
            });

        },

        /*bindEvents: function() {
            var self=this;
            var actions = self.getActionsForEvent("selection");

            map.addLayer('mylayer', {
                click: function(data, path, event) {
                    // handle mouse clicks
                    // *data* holds the data dictionary of the clicked path
                    // *path* is the raphael object
                    // *event* is the original JavaScript event
                }
            });

            if (actions.length > 0) {
                //

                options["callback"] = function (x) {

                    // selection is done on x axis so I need to take the record with range [min_x, max_x]
                    // is the group attribute
                    var record_min = _.min(x, function (d) {
                        return d.min.x
                    });
                    var record_max = _.max(x, function (d) {
                        return d.max.x
                    });

                    view.doActions(actions, [record_min.min.record, record_max.max.record]);

                };
            } else
                options["callback"] = function () {
                };
        },*/


        doActions:function (actions, data) {

            _.each(actions, function (d) {
                d.action._internalDoAction([data]);
            });

            params.push({
                filter : mapp.filter,
                value : values
            });

        },

        getActionsForEvent:function (eventType) {
            var self = this;
            var actions = [];

            _.each(self.options.actions, function (d) {
                if (_.contains(d.event, eventType))
                    actions.push(d);
            });

            return actions;
        }


    });


})(jQuery, recline.View);

this.recline = this.recline || {};
this.recline.View = this.recline.View || {};

(function ($, view) {
    "use strict";

    view.Loader = Backbone.View.extend({
    	divOver:  null,
    	loaderCount : 0,
        initialize:function (args) {
            _.bindAll(this, 'render', 'incLoaderCount', 'decLoaderCount', 'bindDatasets', 'bindDataset', 'bindCharts', 'bindChart');
        	this.divOver = $('<div/>');
        	this.divOver.attr('style','display:none;opacity:0.7;background:#f9f9f9;position:absolute;top:0;z-index:100;width:100%;height:100%');
        	this.datasets = args.datasets;
        	this.charts = args.charts;
        	this.baseurl = "/"
        	if (args.baseurl)
        		this.baseurl = args.baseurl;
        	$(document.body).append(this.divOver);    
        },
        render:function () {
        	$(document.body).append(this.htmlLoader.replace("{{baseurl}}", this.baseurl));
        	this.divOver.show();
        	this.bindDatasets(this.datasets);
        	this.bindCharts(this.charts);
        },
    	htmlLoader : 
    		'<div id="loadingImage" style="display:block"> \
    			<div style="position:absolute;top:45%;left:45%;width:150px;height:80px;z-index:100"> \
    				<p class="centered"> \
    					<img src="{{baseurl}}images/ajax-loader-blue.gif" > \
    				</p> \
    			</div> \
    		</div>',
    	incLoaderCount : function() {
    		this.loaderCount++;
    		//console.log("Start task - loaderCount = "+this.loaderCount)
    		this.divOver.show();
    		document.getElementById("loadingImage").style.display = "block"; 
    	},
    	decLoaderCount : function() { 
    		var self = this;
    		this.loaderCount--;
    		//console.log("End task - loaderCount = "+this.loaderCount)
    		if (this.loaderCount <= 0) {
    			//setTimeout(function() {
    				document.getElementById("loadingImage").style.display = "none";
    				self.divOver.hide();
    			//}, 100)
    			this.loaderCount = 0;
    		}
    	},
    	bindDatasets: function(datasets) {
    		var self = this;
    		_.each(datasets, function (dataset) {
    			dataset.bind('query:start', self.incLoaderCount);
    			dataset.bind('query:done query:fail', self.decLoaderCount);
    		});
    	},
    	
    	bindDataset: function(dataset) {
    		dataset.bind('query:start', this.incLoaderCount);
    		dataset.bind('query:done query:fail', this.decLoaderCount);
    	},
    	bindCharts:function(charts) {
    		var self = this;
    		_.each(charts, function (chart) {
    			chart.bind('chart:startDrawing', self.incLoaderCount);
    			chart.bind('chart:endDrawing', self.decLoaderCount);
    		});
    	},
    	bindChart:function(chart) {
    		chart.bind('chart:startDrawing', this.incLoaderCount);
    		chart.bind('chart:endDrawing', this.decLoaderCount);
    	}    
    });
})(jQuery, recline.View);
this.recline = this.recline || {};
this.recline.View = this.recline.View || {};

(function ($, view) {
    "use strict";

    view.NoDataMsg = Backbone.View.extend({
    	templateP1:"<div class='noData' style='display:table;width:100%;height:100%;'>" +
    			"<p style='display:table-cell;width:100%;height:100%;margin-left: auto;margin-right: auto;text-align: center;margin-bottom: auto;margin-top: auto;vertical-align: middle;'>",
    	template2P1:"<div class='noData' style='width:100%;height:100%;'>" +
    			"<p style='width:100%;height:100%;margin-left: auto;margin-right: auto;text-align: center;margin-bottom: 10px;margin-top:10px;'>",
    	_internalMsg : "No Data Available!",
    	templateP2:"</p></div>",
        initialize:function() {
        },
        create:function(msg) {
        	if (msg)
        		return this.templateP1+msg+this.templateP2;
        	
        	return this.templateP1+this._internalMsg+this.templateP2
        },
        create2:function(msg) {
        	if (msg)
        		return this.template2P1+msg+this.templateP2;
        	
        	return this.template2P1+this._internalMsg+this.templateP2
        }
    });
})(jQuery, recline.View);
/*jshint multistr:true */

this.recline = this.recline || {};
this.recline.View = this.recline.View || {};

(function ($, my) {

// ## Linegraph view for a Dataset using nvd3 graphing library.
//
// Initialization arguments (in a hash in first parameter):
//
// * model: recline.Model.Dataset
// * state: (optional) configuration hash of form:
//
//        { 
//          group: {column name for x-axis},
//          series: [{column name for series A}, {column name series B}, ... ],
//          colors: ["#edc240", "#afd8f8", ...]
//        }
//
// NB: should *not* provide an el argument to the view but must let the view
// generate the element itself (you can then append view.el to the DOM.
    my.NVD3Graph = Backbone.View.extend({

        template:'<div class="recline-graph"> \
      <div class="panel nvd3graph_{{viewId}}"style="display: block;"> \
        <div id="nvd3chart_{{viewId}}"><svg version="1.1" xmlns="http://www.w3.org/2000/svg" class="bstrap" width="{{width}}" height="{{height}}"> \
        	  <defs> \
		    	<marker id = "Circle" viewBox = "0 0 40 40" refX = "12" refY = "12" markerWidth = "6" markerHeight = "6" stroke = "white" stroke-width = "4" fill = "dodgerblue" orient = "auto"> \
		    	<circle cx = "12" cy = "12" r = "12"/> \
		    	</marker> \
		      </defs> \
        	</svg></div>\
      </div> \
    </div> ',

        initialize:function (options) {
            var self = this;

            this.uid = options.id || ("" + new Date().getTime() + Math.floor(Math.random() * 10000)); // generating an unique id for the chart
            this.el = $(this.el);
            _.bindAll(this, 'render', 'redraw', 'graphResize', 'changeDimensions');


            this.model.bind('change', this.render);
            this.model.fields.bind('reset', this.render);
            this.model.fields.bind('add', this.render);

            this.model.bind('query:done', this.redraw);
            this.model.queryState.bind('selection:done', this.redraw);
            this.model.bind('dimensions:change', this.changeDimensions);


            var stateData = _.extend({
                    group:null,
                    seriesNameField:[],
                    seriesValues:[],
                    colors:["#edc240", "#afd8f8", "#cb4b4b", "#4da74d", "#9440ed"],
                    graphType:"lineChart",
                    xLabel:"",
                    id:0



                },
                options.state
            );
            this.state = new recline.Model.ObjectState(stateData);
            if (this.options.state.options.loader)
            	this.options.state.options.loader.bindChart(this);
        },

        changeDimensions: function() {
            var self=this;
            self.state.attributes.group = self.model.getDimensions();
        },

        render:function () {
            var self = this;
            self.trigger("chart:startDrawing")

            var tmplData = this.model.toTemplateJSON();
            tmplData["viewId"] = this.uid;
            if (this.state.attributes.width)
            	tmplData.width = this.state.attributes.width;

            if (this.state.attributes.height)
            	tmplData.height = this.state.attributes.height;

            delete this.chart;
            
            
            if (tmplData.recordCount && tmplData.recordCount > 0)
            {
                var htmls = Mustache.render(this.template, tmplData);
                $(this.el).html(htmls);
                this.$graph = this.el.find('.panel.nvd3graph_' + tmplData["viewId"]);
                self.trigger("chart:endDrawing")
                return this;
            }
            else
            {
                var svgElem = this.el.find('#nvd3chart_' + self.uid+ ' svg') 
            	svgElem.css("display", "block")
            	// get computed dimensions
            	var width = svgElem.width()
            	var height = svgElem.height()

            	// display noData message and exit
            	svgElem.css("display", "none")
            	this.el.find('#nvd3chart_' + self.uid).width(width).height(height).append(new recline.View.NoDataMsg().create());
                self.trigger("chart:endDrawing")
            	return this;
        	}


        },

        getActionsForEvent:function (eventType) {
            var actions = [];

            _.each(this.options.actions, function (d) {
                if (_.contains(d.event, eventType))
                    actions.push(d);
            });

            return actions;
        },

        redraw:function () {
            var self = this;
            self.trigger("chart:startDrawing")
            
            var svgElem = this.el.find('#nvd3chart_' + self.uid+ ' svg') 
        	svgElem.css("display", "block")
        	// get computed dimensions
        	var width = svgElem.width()
        	var height = svgElem.height()

            var state = this.state;
            var seriesNVD3 = this.createSeriesNVD3();
        	var totalValues = 0;
            if (seriesNVD3)
        	{
            	_.each(seriesNVD3, function(s) {
            		if (s.values)
            			totalValues += s.values.length
            	});
        	}
            if (!totalValues)
        	{
            	// display noData message and exit
            	svgElem.css("display", "none")
            	this.el.find('#nvd3chart_' + self.uid).width(width).height(height).append(new recline.View.NoDataMsg().create());
                self.trigger("chart:endDrawing")
            	return null;
        	}
            var graphType = this.state.get("graphType");

            var viewId = this.uid;

            var model = this.model;
            var state = this.state;
            var xLabel = this.state.get("xLabel");
            var yLabel = this.state.get("yLabel");

            nv.addGraph(function () {
                self.chart = self.getGraph[graphType](self);
                var svgElem = self.el.find('#nvd3chart_' + self.uid+ ' svg')
                var graphModel = self.getGraphModel(self, graphType)
                
                if (self.options.state.options.noTicksX)
                    self.chart.xAxis.tickFormat(function (d) { return ''; });                	
                if (self.options.state.options.noTicksY)
                    self.chart.yAxis.tickFormat(function (d) { return ''; });                	
	
                if (self.options.state.options.customTooltips)
            	{
                	var leftOffset = 10;
                	var topOffset = 0;
                    //console.log("Replacing original tooltips")
                    
                    var xfield = self.model.fields.get(self.state.attributes.group);
                    var yfield = self.model.fields.get(self.state.attributes.series);
                    
                    graphModel.dispatch.on('elementMouseover.tooltip', function(e) {
                    	var pos;
                    	if (e.e && e.e.pageY && e.e.pageX)
                    		pos = {top: e.e.pageY, left: e.e.pageX}
                    	else pos = {left: e.pos[0] + +svgElem.offset().left + 50, top: e.pos[1]+svgElem.offset().top}
                    	
                        var values = { 
                        				x: self.getFormatter[xfield.get('type')](e.point.x),
                        				y: e.point.y,
                        				xLabel: e.series.key,
                        				yLabel: "" 
                        			}
                        var content = Mustache.render(self.options.state.options.customTooltips, values);

                        nv.tooltip.show([pos.left+leftOffset, pos.top+topOffset], content, (pos.left < self.el[0].offsetLeft + self.el.width()/2 ? 'w' : 'e'), null, self.el[0]);
                      });
                    
                    graphModel.dispatch.on('elementMouseout.tooltip', function(e) {
                    	nv.tooltip.cleanup();
                    });
            	}

                if (self.state.attributes.options) {
                    _.each(_.keys(self.state.attributes.options), function (d) {
                        try {
                            self.addOption[d](self.chart, self.state.attributes.options[d]);
                        }
                        catch (err) {
                            console.log("view.nvd3.graph.js: cannot add options " + d + " for graph type " + graphType)
                        }
                    });
                }
                ;

                d3.select('#nvd3chart_' + self.uid + '  svg')
                    .datum(seriesNVD3)
                    .transition()
                    .duration(500)
                    .call(self.chart);

                nv.utils.windowResize(self.graphResize);
                self.trigger("chart:endDrawing")

                //self.graphResize()
                return  self.chart;
            });
        },

        graphResize:function () {
            var self = this;
            var viewId = this.uid;

            // this only works by previously setting the body height to a numeric pixel size (percentage size don't work)
            // so we assign the window height to the body height with the command below
            var container = self.el;
            while (!container.hasClass('container-fluid') && !container.hasClass('container'))
            	container = container.parent();
            
            if (typeof container != "undefined" && container != null 
            		&& (container.hasClass('container') || container.hasClass('container-fluid'))
            		&& container[0].style && container[0].style.height
            		&& container[0].style.height.indexOf("%") > 0) 
            {
	            $("body").height($(window).innerHeight() - 10);
	
	            var currAncestor = self.el;
	            while (!currAncestor.hasClass('row-fluid') && !currAncestor.hasClass('row'))
	                currAncestor = currAncestor.parent();
	
	            if (typeof currAncestor != "undefined" && currAncestor != null && (currAncestor.hasClass('row-fluid') || currAncestor.hasClass('row'))) {
	                var newH = currAncestor.height();
	                $('#nvd3chart_' + viewId).height(newH);
	                $('#nvd3chart_' + viewId + '  svg').height(newH);
	            }
            }
            if (self.chart && self.chart.update)
            	self.chart.update(); // calls original 'update' function
        },


        setAxis:function (axis, chart) {
            var self = this;

            var xLabel = self.state.get("xLabel");

            if (axis == "all" || axis == "x") {
                var xfield = self.model.fields.get(self.state.attributes.group);

                // set label
                if (xLabel == null || xLabel == "" || typeof xLabel == 'undefined')
                    xLabel = xfield.get('label');

                // set data format
                chart.xAxis
                    .axisLabel(xLabel)
                    .tickFormat(self.getFormatter[xfield.get('type')]);

            } else if (axis == "all" || axis == "y") {
                var yLabel = self.state.get("yLabel");

                if (yLabel == null || yLabel == "" || typeof yLabel == 'undefined')
                    yLabel = self.state.attributes.seriesValues.join("/");

                // todo yaxis format must be passed as prop
                chart.yAxis
                    .axisLabel(yLabel)
                    .tickFormat(d3.format('s'));
            }
        },

        getFormatter:{
            "string":d3.format(',s'),
            "float":d3.format(',r'),
            "integer":d3.format(',r'),
            "date":function (d) {
                return d3.time.format('%x')(new Date(d));
            }

        },

        addOption:{
            "staggerLabels":function (chart, value) {
                chart.staggerLabels(value);
            },
            "tooltips":function (chart, value) {
                chart.tooltips(value);
            },
            "showValues":function (chart, value) {
                chart.showValues(value);
            },
            "tooltip": function(chart, value) {
                var t = function(key, x, y, e, graph) {
                    return value.replace("{x}", x)
                        .replace("{y}", y)
                        .replace("{key}", key);
                };
                chart.tooltip(t);
            },
            "minmax":function (chart, value) {
            },
            "trendlines":function (chart, value) {
            },
            "showLegend":function(chart, value) {
                chart.showLegend(value);
            },
            "showControls":function(chart, value) {
                chart.showControls(value);
            },
            showValues: function(chart, value) {
                chart.showValues(value);
            },
            "customTooltips":function (chart, value) { 
            }
        },


        getGraph:{
            "multiBarChart":function (view) {
                var chart;
                if (view.chart != null)
                    chart = view.chart;
                else
                    chart = nv.models.multiBarChart();

                view.setAxis("all", chart);
                return chart;
            },
            "lineChart":function (view) {
                var chart;
                if (view.chart != null)
                    chart = view.chart;
                else
                    chart = nv.models.lineChart();
                view.setAxis("all", chart);
                return chart;
            },
            "lineDottedChart":function (view) {
                var chart;
                if (view.chart != null)
                    chart = view.chart;
                else
                    chart = nv.models.lineDottedChart();
                view.setAxis("all", chart);
                return chart;
            },
            "lineWithFocusChart":function (view) {
                var chart;
                if (view.chart != null)
                    chart = view.chart;
                else
                    chart = nv.models.lineWithFocusChart();

                view.setAxis("all", chart);
                return chart;
            },
            "indentedTree":function (view) {
                var chart;
                if (view.chart != null)
                    chart = view.chart;
                else
                    chart = nv.models.indentedTree();
            },
            "stackedAreaChart":function (view) {
                var chart;
                if (view.chart != null)
                    chart = view.chart;
                else
                    chart = nv.models.stackedAreaChart();
                view.setAxis("all", chart);
                return chart;
            },

            "historicalBar":function (view) {
                var chart;
                if (view.chart != null)
                    chart = view.chart;
                else
                    chart = nv.models.historicalBar();
                return chart;
            },
            "multiBarHorizontalChart":function (view) {
                var chart;
                if (view.chart != null)
                    chart = view.chart;
                else
                    chart = nv.models.multiBarHorizontalChart();
                view.setAxis("all", chart);

                return chart;
            },
            "legend":function (view) {
                var chart;
                if (view.chart != null)
                    chart = view.chart;
                else
                    chart = nv.models.legend();
                return chart;
            },
            "line":function (view) {
                var chart;
                if (view.chart != null)
                    chart = view.chart;
                else
                    chart = nv.models.line();
                return chart;
            },
            "sparkline":function (view) {
                var chart;
                if (view.chart != null)
                    chart = view.chart;
                else
                    chart = nv.models.sparkline();
                return chart;
            },
            "sparklinePlus":function (view) {
                var chart;
                if (view.chart != null)
                    chart = view.chart;
                else
                    chart = nv.models.sparklinePlus();
                return chart;
            },

            "multiChart":function (view) {
                var chart;
                if (view.chart != null)
                    chart = view.chart;
                else
                    chart = nv.models.multiChart();
                return chart;
            },


            "bulletChart":function (view) {
                var chart;
                if (view.chart != null)
                    chart = view.chart;
                else
                    chart = nv.models.bulletChart();
                return chart;
            },
            "linePlusBarChart":function (view) {
                var chart;
                if (view.chart != null)
                    chart = view.chart;
                else
                    chart = nv.models.linePlusBarChart();
                view.setAxis("all", chart);
                return chart;
            },
            "cumulativeLineChart":function (view) {
                var chart;
                if (view.chart != null)
                    chart = view.chart;
                else
                    chart = nv.models.cumulativeLineChart();
                view.setAxis("all", chart);
                return chart;
            },
            "scatterChart":function (view) {
                var chart;
                if (view.chart != null)
                    chart = view.chart;
                else
                    chart = nv.models.scatterChart();
                chart.showDistX(true)
                    .showDistY(true);
                view.setAxis("all", chart);
                return chart;
            },
            "discreteBarChart":function (view) {
                var actions = view.getActionsForEvent("selection");
                var chart;
                if (view.chart != null)
                    chart = view.chart;
                else
                    chart = nv.models.discreteBarChart();
                view.setAxis("all", chart);

                if (actions.length > 0)
                    chart.discretebar.dispatch.on('elementClick', function (e) {
                        view.doActions(actions, [e.point.record]);
                    });
                return chart;
                var actions = view.getActionsForEvent("selection");
                var options = {};

                if (view.state.attributes.options) {
                    if (view.state.attributes.options("trendlines"))
                        options["trendlines"] = view.state.attributes.options("trendlines");
                    if (view.state.attributes.options("minmax"))
                        options["minmax"] = view.state.attributes.options("minmax");

                }


                if (actions.length > 0) {
                    options["callback"] = function (x) {

                        // selection is done on x axis so I need to take the record with range [min_x, max_x]
                        // is the group attribute
                        var record_min = _.min(x, function (d) {
                            return d.min.x
                        });
                        var record_max = _.max(x, function (d) {
                            return d.max.x
                        });

                        view.doActions(actions, [record_min.min.record, record_max.max.record]);

                    };
                } else
                    options["callback"] = function () {
                    };
            },
            "lineWithBrushChart":function (view) {


                var chart;
                if (view.chart != null)
                    chart = view.chart;
                else
                    chart = nv.models.lineWithBrushChart(options);
                view.setAxis("all", chart);
                return  chart
            },
            "multiBarWithBrushChart":function (view) {
                var actions = view.getActionsForEvent("selection");
                var options = {};

                if (view.state.attributes.options) {
                    if (view.state.attributes.options("trendlines"))
                        options["trendlines"] = view.state.attributes.options("trendlines");
                    if (view.state.attributes.options("minmax"))
                        options["minmax"] = view.state.attributes.options("minmax");

                }

                if (actions.length > 0) {
                    options["callback"] = function (x) {

                        // selection is done on x axis so I need to take the record with range [min_x, max_x]
                        // is the group attribute
                        var record_min = _.min(x, function (d) {
                            return d.min.x
                        });
                        var record_max = _.max(x, function (d) {
                            return d.max.x
                        });

                        view.doActions(actions, [record_min.min.record, record_max.max.record]);

                    };
                } else
                    options["callback"] = function () {
                    };

                var chart;
                if (view.chart != null)
                    chart = view.chart;
                else
                    chart = nv.models.multiBarWithBrushChart(options);

                return chart;
            },

            "pieChart":function (view) {
                var chart;
                if (view.chart != null)
                    chart = view.chart;
                else
                    chart = nv.models.pieChart();

                chart.values(function(d) {
                    var ret=[];
                    _.each(d.values, function(dd) {
                        ret.push({x: dd.x, y:dd.y});
                    });
                    return ret;
                });

                return chart;
            }

        },
        getGraphModel: function(self, graphType) {
        	switch(graphType) {
        		
            case "historicalBar":
        	case "multiBarChart": 
            case "multiBarWithBrushChart":
            case "multiBarHorizontalChart":
        		return self.chart.multibar;
            case "lineChart":
            case "lineDottedChart":
            case "lineWithFocusChart":
            case "linePlusBarChart":
            case "cumulativeLineChart":
            case "lineWithBrushChart":
        		return self.chart.lines;
            case "bulletChart":
        		return self.chart.bullet;
            case "scatterChart":
        		return self.chart.scatter;
            case "stackedAreaChart":
            case "pieChart":
        		return self.chart.pie;
            case "discreteBarChart":
        		return self.chart.discretebar;
        	}
        },

        doActions:function (actions, records) {

            _.each(actions, function (d) {
                d.action.doAction(records, d.mapping);
            });

        },

        getFieldLabel: function(field){
            var self=this;
            var fieldLabel = field.attributes.label;
            if (field.attributes.is_partitioned)
                fieldLabel = field.attributes.partitionValue;

            if (typeof self.state.attributes.fieldLabels != "undefined" && self.state.attributes.fieldLabels != null) {
                var fieldLabel_alternateObj = _.find(self.state.attributes.fieldLabels, function (fl) {
                    return fl.id == fieldLabel
                });
                if (typeof fieldLabel_alternateObj != "undefined" && fieldLabel_alternateObj != null)
                    fieldLabel = fieldLabel_alternateObj.label;
            }

            return fieldLabel;
        },


        createSeriesNVD3:function () {

            var self = this;
            var series = [];

            //  {type: "byFieldName", fieldvaluesField: ["y", "z"]}
            var seriesAttr = this.state.attributes.series;

            var fillEmptyValuesWith = seriesAttr.fillEmptyValuesWith;

            //var seriesNameField = self.model.fields.get(this.state.attributes.seriesNameField) ;
            //var seriesValues = self.model.fields.get(this.state.attributes.seriesValues);
            //if(seriesValues == null)
            //var seriesValues = this.state.get("seriesValues") ;

            var xAxisIsDate = false;
            var unselectedColor = "#C0C0C0";
            if (self.state.attributes.unselectedColor)
                unselectedColor = self.state.attributes.unselectedColor;
            var selectionActive = false;
            if (self.model.queryState.isSelected())
                selectionActive = true;

            var resultType = "filtered";
            if(self.options.resultType)
                resultType = self.options.resultType;

            var records = self.model.getRecords(resultType); 

            var xfield = self.model.fields.get(self.state.attributes.group);
            if(!xfield)
                throw "View.nvd3: unable to find field [" + self.state.attributes.group + "] on model"

            if (xfield.get('type') === 'date') {
                xAxisIsDate = true;
            }

            var uniqueX = [];
            var sizeField;
            if (seriesAttr.sizeField) {
                sizeField = self.model.fields.get(seriesAttr.sizeField);

                if(!sizeField)
                    throw "View.nvd3: unable to find field [" + seriesAttr.sizeField + "] on model"
            }


            // series are calculated on data, data should be analyzed in order to create series
            if (seriesAttr.type == "byFieldValue") {
                var seriesTmp = {};
                var seriesNameField = self.model.fields.get(seriesAttr.seriesField);
                if(!seriesNameField)
                    throw "View.nvd3: unable to find field [" + seriesAttr.seriesField + "] on model"

                var fieldValue = self.model.fields.get(seriesAttr.valuesField);
                if(!fieldValue)
                    throw "View.nvd3: unable to find field [" + seriesAttr.valuesField + "] on model"

            	_.each(records, function (doc, index) {

                    // key is the field that identiy the value that "build" series
                    var key = doc.getFieldValueUnrendered(seriesNameField);
                    var tmpS;

                    // verify if the serie is already been initialized
                    if (seriesTmp[key] != null) {
                        tmpS = seriesTmp[key]
                    }
                    else {
                        tmpS = {key:key, values:[]};

                        var color = doc.getFieldColor(seriesNameField);

                        if (color != null)
                            tmpS["color"] = color;


                    }
                    var shape = doc.getFieldShapeName(seriesNameField);

                    var x = doc.getFieldValueUnrendered(xfield);
                    var y = doc.getFieldValueUnrendered(fieldValue);


                    var point = {x:x, y:y, record:doc};
                    if (sizeField)
                        point["size"] = doc.getFieldValueUnrendered(sizeField);
                    if(shape != null)
                        point["shape"] = shape;

                    tmpS.values.push(point);

                    if (fillEmptyValuesWith != null) {
                        uniqueX.push(x);

                    }

                    seriesTmp[key] = tmpS;

                });

                for (var j in seriesTmp) {
                    series.push(seriesTmp[j]);
                }

            }
            else if (seriesAttr.type == "byFieldName" || seriesAttr.type == "byPartitionedField") {
                var serieNames;

                // if partitions are active we need to retrieve the list of partitions
                if (seriesAttr.type == "byFieldName")
                    serieNames = seriesAttr.valuesField;
                else {
                    serieNames = [];
                    _.each(seriesAttr.aggregationFunctions, function (a) {
                        _.each(self.model.getPartitionedFieldsForAggregationFunction(a, seriesAttr.aggregatedField), function (f) {
                            serieNames.push(f.get("id"));
                        })

                    });

                }

                _.each(serieNames, function (field) {
                    var yfield = self.model.fields.get(field);

                    if(!yfield)
                        throw "View.nvd3: unable to find field [" + field + "] on model"

                    var points = [];

                    _.each(records, function (doc, index) {

                        var x = doc.getFieldValueUnrendered(xfield);

                        try {

                            var y = doc.getFieldValueUnrendered(yfield);
                            if (y != null) {
                                var color;

                                if (selectionActive) {
                                    if (doc.isRecordSelected())
                                        color = doc.getFieldColor(yfield);
                                    else
                                        color = unselectedColor;
                                } else
                                    color = doc.getFieldColor(yfield);

                                var shape = doc.getFieldShapeName(yfield);

                                var point = {x:x, y:y, record:doc};

                                if(color != null)
                                    point["color"] = color;
                                if(shape != null)
                                    point["shape"] = shape;

                                if (sizeField)
                                    point["size"] = doc.getFieldValueUnrendered(sizeField);

                                points.push(point);

                                if (fillEmptyValuesWith != null) {
                                    uniqueX.push(x);
                                }
                            }

                        }
                        catch (err) {
                            //console.log("Can't add field [" + field + "] to graph, filtered?")
                        }
                    });

                    if (points.length > 0)
                        series.push({values:points, key:self.getFieldLabel(yfield), color:yfield.getColorForPartition()});
                });

            } else throw "views.nvd3.graph.js: unsupported or not defined type " + seriesAttr.type;

            // foreach series fill empty values
            if (fillEmptyValuesWith != null) {
                uniqueX = _.unique(uniqueX);
                _.each(series, function (s) {
                    // foreach series obtain the unique list of x
                    var tmpValues = _.map(s.values, function (d) {
                        return d.x
                    });
                    // foreach non present field set the value
                    _.each(_.difference(uniqueX, tmpValues), function (diff) {
                        s.values.push({x:diff, y:fillEmptyValuesWith});
                    });

                });
            }

            return series;
        }


    });


})(jQuery, recline.View);

this.recline = this.recline || {};
this.recline.View = this.recline.View || {};

(function ($, view) {

    "use strict";

    view.Rickshaw = Backbone.View.extend({
        template:'<div id="{{uid}}"> <div> ',

        initialize:function (options) {

            this.el = $(this.el);
            _.bindAll(this, 'render', 'redraw');


            this.model.bind('change', this.render);
            this.model.fields.bind('reset', this.render);
            this.model.fields.bind('add', this.render);

            this.model.bind('query:done', this.redraw);
            this.model.queryState.bind('selection:done', this.redraw);

            this.uid = options.id || ("d3_" + new Date().getTime() + Math.floor(Math.random() * 10000)); // generating an unique id for the chart

            this.options = options;


        },

        render:function () {
            console.log("View.Rickshaw: render");
            var self = this;

            var graphid = "#" + this.uid;

            if (self.graph) {
                jQuery(graphid).empty();
                delete self.graph;
            }

            var out = Mustache.render(this.template, this);
            this.el.html(out);


        },

        redraw:function () {
            var self = this;

            console.log("View.Rickshaw: redraw");


            if (self.graph)
                self.updateGraph();
            else
                self.renderGraph();

        },
        updateGraph:function () {
            var self = this;
            //self.graphOptions.series = this.createSeries();
            self.createSeries();

            self.graph.update();
            //self.graph.render();
        },

        renderGraph:function () {
            var self = this;
            this.graphOptions = {
                element:document.querySelector('#' + this.uid)
            };

            self.graphOptions = _.extend(self.graphOptions, self.options.state.options);
            self.createSeries();

            self.graphOptions.series = self.series;

            self.graph = new Rickshaw.Graph(self.graphOptions);

            if (self.options.state.unstack) {
                self.graph.renderer.unstack = true;
            }


            self.graph.render();

            var hoverDetailOpt = { graph:self.graph };
            hoverDetailOpt = _.extend(hoverDetailOpt, self.options.state.hoverDetailOpt);


            var hoverDetail = new Rickshaw.Graph.HoverDetail(hoverDetailOpt);

            var xAxisOpt = { graph:self.graph };
            xAxisOpt = _.extend(xAxisOpt, self.options.state.xAxisOptions);


            var xAxis = new Rickshaw.Graph.Axis.Time(xAxisOpt);


            xAxis.render();

            var yAxis = new Rickshaw.Graph.Axis.Y({
                graph:self.graph
            });


            yAxis.render();

            if (self.options.state.events) {

                self.annotator = new Rickshaw.Graph.Annotate({
                    graph:self.graph,
                    element:document.getElementById('timeline')
                });

                var timeField = self.options.state.events.timeField;
                var valueField = self.options.state.events.valueField;
                var endField = self.options.state.events.endField;


                _.each(self.options.state.events.dataset.getRecords(self.options.state.events.resultType), function (d) {
                    if (endField)
                        self.annotator.add(d.attributes[timeField], d.attributes[valueField], d.attributes[endField]);
                    else
                        self.annotator.add(d.attributes[timeField], d.attributes[valueField]);

                })

                self.annotator.update()

            }

            if (self.options.state.legend) {
                var legend = new Rickshaw.Graph.Legend({
                    graph:self.graph,
                    element:document.querySelector('#' + self.options.state.legend)
                });

                var shelving = new Rickshaw.Graph.Behavior.Series.Toggle({
                    graph:self.graph,
                    legend:legend
                });

                var order = new Rickshaw.Graph.Behavior.Series.Order({
                    graph:self.graph,
                    legend:legend
                });

                var highlighter = new Rickshaw.Graph.Behavior.Series.Highlight({
                    graph:self.graph,
                    legend:legend
                });
            }

        },

        createSeries:function () {

            var self = this;
            if (!self.series)
                self.series = [];
            else
                self.series.length = 0; // keep reference to old serie

            var series = self.series;

            //  {type: "byFieldName", fieldvaluesField: ["y", "z"]}
            var seriesAttr = this.options.state.series;

            var fillEmptyValuesWith = seriesAttr.fillEmptyValuesWith;

            var unselectedColor = "#C0C0C0";
            if (self.options.state.unselectedColor)
                unselectedColor = self.options.state.unselectedColor;
            var selectionActive = false;
            if (self.model.queryState.isSelected())
                selectionActive = true;

            var resultType = "filtered";
            if (self.options.resultType !== null)
                resultType = self.options.resultType;

            var records = self.model.getRecords(resultType);

            var xfield = self.model.fields.get(self.options.state.group);


            var uniqueX = [];
            var sizeField;
            if (seriesAttr.sizeField) {
                sizeField = self.model.fields.get(seriesAttr.sizeField);
            }


            // series are calculated on data, data should be analyzed in order to create series
            if (seriesAttr.type == "byFieldValue") {
                var seriesTmp = {};
                var seriesNameField = self.model.fields.get(seriesAttr.seriesField);
                var fieldValue = self.model.fields.get(seriesAttr.valuesField);


                if (!fieldValue) {
                    throw "view.rickshaw: unable to find field [" + seriesAttr.valuesField + "] in model"
                }


                _.each(records, function (doc, index) {

                    // key is the field that identiy the value that "build" series
                    var key = doc.getFieldValueUnrendered(seriesNameField);
                    var tmpS;

                    // verify if the serie is already been initialized
                    if (seriesTmp[key] != null) {
                        tmpS = seriesTmp[key]
                    }
                    else {
                        tmpS = {name:key, data:[], field:fieldValue};

                        var color = doc.getFieldColor(seriesNameField);


                        if (color != null)
                            tmpS["color"] = color;


                    }
                    var shape = doc.getFieldShapeName(seriesNameField);
                    var x;
                    if (xfield.attributes.type == "date")
                        x = Math.floor(doc.getFieldValueUnrendered(xfield) / 1000); // rickshaw don't use millis
                    else
                        x = doc.getFieldValueUnrendered(xfield);

                    var x_formatted = doc.getFieldValue(xfield);
                    var y = doc.getFieldValueUnrendered(fieldValue);
                    var y_formatted = doc.getFieldValue(fieldValue);

                    if (y && !isNaN(y)) {


                        var point = {x:x, y:y, record:doc, y_formatted:y_formatted, x_formatted:x_formatted};
                        if (sizeField)
                            point["size"] = doc.getFieldValueUnrendered(sizeField);
                        if (shape != null)
                            point["shape"] = shape;

                        tmpS.data.push(point);

                        if (fillEmptyValuesWith != null) {
                            uniqueX.push(x);
                        }

                        seriesTmp[key] = tmpS;
                    }
                });

                for (var j in seriesTmp) {
                    series.push(seriesTmp[j]);
                }

            }
            else if (seriesAttr.type == "byFieldName" || seriesAttr.type == "byPartitionedField") {
                var serieNames;

                // if partitions are active we need to retrieve the list of partitions
                if (seriesAttr.type == "byFieldName") {
                    serieNames = seriesAttr.valuesField;
                }
                else {
                    serieNames = [];
                    _.each(seriesAttr.aggregationFunctions, function (a) {
                        _.each(self.model.getPartitionedFieldsForAggregationFunction(a, seriesAttr.aggregatedField), function (f) {
                            serieNames.push(f.get("id"));
                        })

                    });

                }

                _.each(serieNames, function (field) {

                    var yfield;
                    if (seriesAttr.type == "byFieldName")
                        yfield = self.model.fields.get(field.fieldName);
                    else
                        yfield = self.model.fields.get(field);

                    var fixedColor;
                    if (field.fieldColor)
                        fixedColor = field.fieldColor;

                    var points = [];

                    _.each(records, function (doc, index) {
                        var x;
                        if (xfield.attributes.type == "date")
                            x = Math.floor(doc.getFieldValueUnrendered(xfield) / 1000); // rickshaw don't use millis
                        else
                            x = doc.getFieldValueUnrendered(xfield);

                        var x_formatted = doc.getFieldValue(xfield); // rickshaw don't use millis


                        try {

                            var y = doc.getFieldValueUnrendered(yfield);
                            var y_formatted = doc.getFieldValue(yfield);

                            if (y != null && !isNaN(y)) {
                                var color;

                                var calculatedColor = doc.getFieldColor(yfield);

                                if (selectionActive) {
                                    if (doc.isRecordSelected())
                                        color = calculatedColor;
                                    else
                                        color = unselectedColor;
                                } else
                                    color = calculatedColor;

                                var shape = doc.getFieldShapeName(yfield);

                                var point = {x:x, y:y, record:doc, y_formatted:y_formatted, x_formatted:x_formatted};

                                if (color != null)
                                    point["color"] = color;
                                if (shape != null)
                                    point["shape"] = shape;

                                if (sizeField)
                                    point["size"] = doc.getFieldValueUnrendered(sizeField);

                                points.push(point);

                                if (fillEmptyValuesWith != null) {
                                    uniqueX.push(x);
                                }
                            }

                        }
                        catch (err) {
                            //console.log("Can't add field [" + field + "] to graph, filtered?")
                        }
                    });

                    if (points.length > 0) {
                        var color;
                        if (fixedColor)
                            color = fixedColor;
                        else
                            color = yfield.getColorForPartition();
                        var ret = {data:points, name:self.getFieldLabel(yfield)};
                        if (color)
                            ret["color"] = color;
                        series.push(ret);
                    }

                });

            } else throw "views.rickshaw.graph.js: unsupported or not defined type " + seriesAttr.type;

            // foreach series fill empty values
            if (fillEmptyValuesWith != null) {
                uniqueX = _.unique(uniqueX);
                _.each(series, function (s) {
                    // foreach series obtain the unique list of x
                    var tmpValues = _.map(s.data, function (d) {
                        return d.x
                    });
                    // foreach non present field set the value
                    _.each(_.difference(uniqueX, tmpValues), function (diff) {
                        s.data.push({x:diff, y:fillEmptyValuesWith});
                    });

                });
            }


        },
        getFieldLabel:function (field) {
            var self = this;
            var fieldLabel = field.attributes.label;
            if (field.attributes.is_partitioned)
                fieldLabel = field.attributes.partitionValue;

            if (typeof self.options.state.fieldLabels != "undefined" && self.options.state.fieldLabels != null) {
                var fieldLabel_alternateObj = _.find(self.state.attributes.fieldLabels, function (fl) {
                    return fl.id == fieldLabel
                });
                if (typeof fieldLabel_alternateObj != "undefined" && fieldLabel_alternateObj != null)
                    fieldLabel = fieldLabel_alternateObj.label;
            }

            return fieldLabel;
        }


    });
})(jQuery, recline.View);/*jshint multistr:true */

this.recline = this.recline || {};
this.recline.View = this.recline.View || {};

(function ($, my) {
// ## SlickGrid Dataset View
//
// Provides a tabular view on a Dataset, based on SlickGrid.
//
// https://github.com/mleibman/SlickGrid
//
// Initialize it with a `recline.Model.Dataset`.
//
// NB: you need an explicit height on the element for slickgrid to work
    my.SlickGridGraph = Backbone.View.extend({
        initialize:function (modelEtc) {
            var self = this;
            this.el = $(this.el);
            this.discardSelectionEvents = false;
            this.el.addClass('recline-slickgrid');
            _.bindAll(this, 'render');
            _.bindAll(this, 'onSelectionChanged');
            _.bindAll(this, 'handleRequestOfRowSelection');

            this.resultType = "filtered";
            if (self.options.resultType !== null)
                this.resultType = self.options.resultType;


            this.model.records.bind('add', this.render);
            this.model.records.bind('reset', this.render);
            this.model.records.bind('remove', this.render);
            this.model.queryState.bind('selection:done', this.handleRequestOfRowSelection);

            var state = _.extend({
                    hiddenColumns:[],
                    visibleColumns:[],
                    columnsOrder:[],
                    columnsSort:{},
                    columnsWidth:[],
                    fitColumns:false
                }, modelEtc.state
            );
            this.state = new recline.Model.ObjectState(state);
        },

        events:{
        },
        render:function () {
            //console.log("View.Slickgrid: render");
            var self = this;
            
            function isTrue(val)
            {
            	return isFinite(val) && val;
            }
            function isFalse(val)
            {
            	return !isFinite(val) || val == false;
            }

            var options = {
                enableCellNavigation:true,
                enableColumnReorder:true,
                enableExpandCollapse:true,
                explicitInitialization:true,
                syncColumnCellResize:true,
                forceFitColumns:this.state.get('fitColumns'),
                useInnerChart:this.state.get('useInnerChart'),
                useInnerChartScale:isTrue(this.state.get('useInnerChart')) && isFalse(this.state.get('hideInnerChartScale')),
                innerChartMax:this.state.get('innerChartMax'),
                useStripedStyle:this.state.get('useStripedStyle'),
                useCondensedStyle:this.state.get('useCondensedStyle'),
                useHoverStyle:this.state.get('useHoverStyle'),
                showLineNumbers:this.state.get('showLineNumbers'),
                showTotals:this.state.get('showTotals'),
                showPartitionedData:this.state.get('showPartitionedData'),
                selectedCellFocus:this.state.get('selectedCellFocus'),
                customHtmlFormatters:this.state.get('customHtmlFormatters'), 
                fieldFormatters:this.state.get('fieldFormatters')
            };
            var optionsFixed = _.clone(options)
            optionsFixed.useInnerChart = options.useInnerChartScale

            // We need all columns, even the hidden ones, to show on the column picker
            var columns = [];
            // custom formatter as default one escapes html
            // plus this way we distinguish between rendering/formatting and computed value (so e.g. sort still works ...)
            // row = row index, cell = cell index, value = value, columnDef = column definition, dataContext = full row values
            var formatter = function (row, cell, value, columnDef, dataContext) {
                var field = self.model.getFields(self.resultType).get(columnDef.id);
                if (field.renderer) {
                    return field.renderer(value, field, dataContext);
                } else {
                    return value;
                }
            }
            var myRecords = self.model.getRecords(self.resultType);
            if (options.showLineNumbers == true && myRecords.length > 0) {
                var column = {
                    id:'lineNumberField',
                    name:'',
                    field:'lineNumberField',
                    sortable:(options.showPartitionedData ? false : true),
                    maxWidth:40,
                    formatter:Slick.Formatters.FixedCellFormatter
                };
                columns.push(column);
            }
            var validFields = [];
            var columnsOrderToUse = this.state.get('columnsOrder');
            if (options.showPartitionedData) {
                var getObjectClass = function (obj) {
                    if (obj && obj.constructor && obj.constructor.toString) {
                        var arr = obj.constructor.toString().match(
                            /function\s*(\w+)/);

                        if (arr && arr.length == 2) {
                            return arr[1];
                        }
                    }

                    return undefined;
                }
                if (getObjectClass(self.model) != "VirtualDataset")
                    throw "Slickgrid exception: showPartitionedData option can only be used on a partitioned virtualmodel! Exiting";

                // obtain a fake partition field since the virtualmodel is missing it.
                // take the first partitioned field available so that the formatter may work
                var firstMeasureFieldname = options.showPartitionedData.measures[0].field;
                var partitionFieldname = options.showPartitionedData.partition;
                var modelAggregatFields = self.model.getPartitionedFields(partitionFieldname, firstMeasureFieldname);
                var fakePartitionFieldname = modelAggregatFields[0].id;

                validFields = self.model.attributes.aggregation.dimensions.concat([options.showPartitionedData.partition]).concat(
                    _.map(options.showPartitionedData.measures, function (m) {
                        return m.field + "_" + m.aggregation
                    })
                );
                // slightly different version of list above. Using fake name instead of real name of column
                var validFieldsForOrdering = self.model.attributes.aggregation.dimensions.concat([fakePartitionFieldname]).concat(
                    _.map(options.showPartitionedData.measures, function (m) {
                        return m.field + "_" + m.aggregation
                    })
                );
                var columnsOrder = this.state.get('columnsOrder');
                if (typeof columnsOrder == "undefined" || columnsOrder == null || columnsOrder.length == 0)
                    columnsOrderToUse = validFieldsForOrdering;


                var columnPart = {
                    id:fakePartitionFieldname,
                    name:options.showPartitionedData.partition,
                    field:options.showPartitionedData.partition,
                    sortable:false,
                    minWidth:80,
                    formatter:formatter
                };
                var widthInfo = _.find(self.state.get('columnsWidth'), function (c) {
                    return c.column == field.id
                });
                if (widthInfo) {
                    column['width'] = widthInfo.width;
                }
                columns.push(columnPart);
            }

            _.each(self.model.getFields(self.resultType).toJSON(), function (field) {
            	var currFormatter = formatter;
            	if (options.customHtmlFormatters && !options.showPartitionedData)
        		{
            		var customFieldFormatInfo = _.find(options.customHtmlFormatters, function(customField) { return customField.id == field.id; });
            		if (customFieldFormatInfo)
            			currFormatter = (customFieldFormatInfo.formula ? Slick.Formatters.HtmlExtFormatter : Slick.Formatters.HtmlFormatter)
        		}
            	var cssClass = "";
            	if (options.fieldFormatters){
            		var info = _.find(options.fieldFormatters, function(customField) { return customField.id == field.id; });
            		if (info)
            			cssClass = info.cssClass;            		
            	}
                var column = {
                    id:field['id'],
                    name:field['label'],
                    field:field['id'],
                    cssClass: cssClass,
                    sortable:(options.showPartitionedData ? false : true),
                    minWidth:80,
                    formatter:currFormatter
                };
                if (self.model.queryState.attributes.sort) {
                    _.each(self.model.queryState.attributes.sort, function (sortCondition) {
                        if (column.sortable && field['id'] == sortCondition.field)
                            column["sorted"] = sortCondition.order; // this info will be checked when onSort is triggered to reverse to existing order (if any)
                    });
                }
                var widthInfo = _.find(self.state.get('columnsWidth'), function (c) {
                    return c.column == field.id
                });
                if (widthInfo) {
                    column['width'] = widthInfo.width;
                }
                if (options.showPartitionedData) {
                    if (_.contains(validFields, field['id']) || (field['id'] == fakePartitionFieldname && field['field'] == options.showPartitionedData.partition))
                        columns.push(column);
                }
                else columns.push(column);
            });
            
            var innerChartSerie1Name = self.state.get('innerChartSerie1');
            var innerChartSerie2Name = self.state.get('innerChartSerie2');

            if (options.useInnerChart == true && myRecords.length > 0) {
                columns.push({
                    name:self.state.get('innerChartHeader'),
                    id:'innerChart',
                    field:'innerChart',
                    sortable:false,
                    alignLeft:true,
                    minWidth:150,
                    // if single series, use percent bar formatter, else twinbar formatter
                    formatter:(innerChartSerie1Name && innerChartSerie2Name ? Slick.Formatters.TwinBarFormatter : Slick.Formatters.PercentCompleteBar)
                })
            }
            if (self.state.get('fieldLabels') && self.state.get('fieldLabels').length > 0) {
                _.each(self.state.get('fieldLabels'), function (newIdAndLabel) {
                    for (var c in columns)
                        if (columns[c].id == newIdAndLabel.id)
                            columns[c].name = newIdAndLabel.label;
                });
            }
            var visibleColumns = [];

            //console.log("#### HIDDEN:");
            //console.log(self.state.get('hiddenColumns'));
            
            
            if (self.state.get('visibleColumns').length > 0) {
                visibleColumns = columns.filter(function (column) {
                    return (_.indexOf(self.state.get('visibleColumns'), column.id) >= 0 || (options.showLineNumbers == true && column.id == 'lineNumberField'));
                });
                if (self.state.get('useInnerChart') == true && myRecords.length > 0)
                    visibleColumns.push(columns[columns.length - 1]); // innerChart field is last one added
            }
            else {
                // Restrict the visible columns
                visibleColumns = columns.filter(function (column) {
                    return _.indexOf(self.state.get('hiddenColumns'), column.id) == -1;
                });
            }
            // Order them if there is ordering info on the state
            if (columnsOrderToUse) {
                visibleColumns = visibleColumns.sort(function (a, b) {
                	var posA = _.indexOf(columnsOrderToUse, a.id);
                	var posB = _.indexOf(columnsOrderToUse, b.id);
                	if (posA >= 0 && posB >= 0)
                		return (posA > posB ? 1 : -1);
                	// innerChart must always be last
                	// lineNumberField must always be first
                	else if (a.id == 'innerChart'  || b.id == 'lineNumberField') 
                		return 1
                	else if (b.id == 'innerChart' || a.id == 'lineNumberField' )
                		return -1
                	else return (posA < posB ? 1 : -1)
                });
                columns = columns.sort(function (a, b) {
                    return _.indexOf(columnsOrderToUse, a.id) > _.indexOf(columnsOrderToUse, b.id) ? 1 : -1;
                });
            }

            // Move hidden columns to the end, so they appear at the bottom of the
            // column picker
            var tempHiddenColumns = [];
            for (var i = columns.length - 1; i >= 0; i--) {
                if (_.indexOf(_.pluck(visibleColumns, 'id'), columns[i].id) == -1) {
                    tempHiddenColumns.push(columns.splice(i, 1)[0]);
                }
            }
            columns = columns.concat(tempHiddenColumns);

            var max = 0;
            var adjustMax = function (val) {
                // adjust max in order to return the highest comfortable number
                var valStr = "" + parseInt(val);
                var totDigits = valStr.length;
                if (totDigits <= 1)
                    return 10;
                else {
                    var firstChar = parseInt(valStr.charAt(0));
                    var secondChar = parseInt(valStr.charAt(1));
                    if (secondChar < 5)
                        return (firstChar + 0.5) * Math.pow(10, totDigits - 1)
                    else return (firstChar + 1) * Math.pow(10, totDigits - 1)
                }
            }

            if (self.state.get('useInnerChart') == true && innerChartSerie1Name && myRecords.length > 0) {
                _.each(myRecords, function (doc) {
                    var row = {};
                    _.each(self.model.getFields(self.resultType).models, function (field) {
                        row[field.id] = doc.getFieldValueUnrendered(field);
                        if (field.id == innerChartSerie1Name || field.id == innerChartSerie2Name) {
                            var currVal = Math.abs(parseFloat(row[field.id]));
                            if (currVal > max)
                                max = currVal;
                        }
                    });
                });
                if (innerChartSerie2Name) // adjust max only for 2 series, not for 1
                	max = adjustMax(max);
                
                options.innerChartMax = max;
            }
            var data = [];
            var rowsToSelect = [];
            var unselectableRowIds = [];
            var jj = 0;

            if (options.showPartitionedData) {
                var partitionFieldname = options.showPartitionedData.partition;
                var dimensionFieldnames = self.model.attributes.aggregation.dimensions;
                var records = myRecords;
                var dimensionValues = []
                for (var d in dimensionFieldnames) {
                    var dimensionFieldname = dimensionFieldnames[d];
                    var currDimensionValues = _.map(records, function (record) {
                        return record.attributes[dimensionFieldname];
                    });
                    dimensionValues[d] = _.uniq(currDimensionValues); // should be already sorted
                }
                var firstMeasureFieldname = options.showPartitionedData.measures[0].field;
                var modelAggregatFields = self.model.getPartitionedFields(partitionFieldname, firstMeasureFieldname);
                var allPartitionValues = _.map(modelAggregatFields, function (f) {
                    return f.attributes.partitionValue;
                });
                var partitionValues = _.uniq(allPartitionValues); // should be already sorted

                var row = {};
                var useSingleDimension = false;
                if (dimensionFieldnames.length == 1) {
                    useSingleDimension = true;
                    dimensionValues[1] = [""]
                    dimensionFieldnames[1] = "___fake____";
                }

                for (var i0 in dimensionValues[0]) {
                    row = {};
                    var dimensionFieldname0 = dimensionFieldnames[0];
                    for (var i1 in dimensionValues[1]) {
                        row = {};
                        var dimensionFieldname1 = dimensionFieldnames[1];
                        var rec = _.find(records, function (r) {
                            return r.attributes[dimensionFieldname0] == dimensionValues[0][i0] && (useSingleDimension || r.attributes[dimensionFieldname1] == dimensionValues[1][i1]);
                        });
                        for (var i2 in partitionValues) {
                            row = {};
                            if (i1 == 0 && i2 == 0)
                                row[dimensionFieldname0] = dimensionValues[0][i0];

                            if (i2 == 0)
                                row[dimensionFieldname1] = dimensionValues[1][i1];

                            row[partitionFieldname] = partitionValues[i2];

                            for (var m in options.showPartitionedData.measures) {
                                var measureField = options.showPartitionedData.measures[m];
                                var measureFieldName = measureField.field
                                var modelAggregationFields = self.model.getPartitionedFields(partitionFieldname, measureFieldName);
                                var modelField = _.find(modelAggregationFields, function (f) {
                                    return f.attributes.partitionValue == partitionValues[i2]
                                });
                                if (modelField) {
                                    if (rec) {
                                        var formattedValue = rec.getFieldValueUnrendered(modelField);
                                        if (formattedValue)
                                            row[measureFieldName + "_" + measureField.aggregation] = rec.getFieldValueUnrendered(modelField);
                                        else row[measureFieldName + "_" + measureField.aggregation] = 0;
                                    }
                                    else row[measureFieldName + "_" + measureField.aggregation] = 0;
                                }
                            }

                            if (options.showLineNumbers == true)
                                row['lineNumberField'] = jj;

                            row['rowNumber'] = jj;
                            row['__orig_record__'] = rec;
                            
                            data.push(row);
                        }
                        if (options.showPartitionedData.showSubTotals) {
                            row = {};
                            row[partitionFieldname] = "<b>Total(s)</b>";
                            for (var m in options.showPartitionedData.measures) {
                                var measureField = options.showPartitionedData.measures[m];
                                var measureFieldName = measureField.field + "_" + measureField.aggregation
                                var modelField = _.find(self.model.getFields(self.resultType).models, function (f) {
                                    return f.attributes.id == measureFieldName
                                });
                                if (modelField && rec) {
                                    var formattedValue = rec.getFieldValueUnrendered(modelField);
                                    if (formattedValue)
                                        row[measureFieldName] = "<b>" + rec.getFieldValueUnrendered(modelField) + "</b>";
                                    else row[measureFieldName] = "<b>" + 0 + "</b>";
                                }
                                else row[measureFieldName] = "<b>" + 0 + "</b>";
                            }
                            unselectableRowIds.push(data.length)
                            data.push(row);
                        }
                    }
                }
            }
            else {
                _.each(myRecords, function (doc) {
                    if (doc.is_selected)
                        rowsToSelect.push(jj);

                    var row = {schema_colors:[]};

                    _.each(self.model.getFields(self.resultType).models, function (field) {
                        row[field.id] = doc.getFieldValueUnrendered(field);
                        if (innerChartSerie1Name && field.id == innerChartSerie1Name)
                            row.schema_colors[0] = doc.getFieldColor(field);

                        if (innerChartSerie2Name && field.id == innerChartSerie2Name)
                            row.schema_colors[1] = doc.getFieldColor(field);
                    });

                    if (self.state.get('useInnerChart') == true && innerChartSerie1Name) {
                        if (innerChartSerie2Name)
                            row['innerChart'] = [ row[innerChartSerie1Name], row[innerChartSerie2Name], max ]; // twinbar for 2 series
                        else row['innerChart'] = [ row[innerChartSerie1Name], max ]; // percent bar for 1 series
                    }
                    if (options.customHtmlFormatters) {
                        _.each(options.customHtmlFormatters, function (customField) {
                        	if (customField.formula)
                        		row[customField.id] = [ doc, customField.formula ];
                        	else row[customField.id] = [ doc.attributes, customField.template ];
                        });                    	
                    }

                    data.push(row);

                    jj++;

                    if (options.showLineNumbers == true)
                        row['lineNumberField'] = jj;
                    
                    row['rowNumber'] = jj;
                    row['__orig_record__'] = doc;
                });
            }

            if (options.showTotals && myRecords.length > 0) {
                options.totals = {};
                var totalsRecord = self.model.getRecords("totals");
                for (var f in options.showTotals) {
                    var currTotal = options.showTotals[f];
                    var fieldObj = self.model.getField_byAggregationFunction("totals" + (currTotal.filtered ? "_filtered" : ""), currTotal.field, currTotal.aggregation);
                    if (typeof fieldObj != "undefined")
                        options.totals[currTotal.field] = totalsRecord[0].getFieldValueUnrendered(fieldObj);
                }
            }

            if (this.options.actions != null && typeof this.options.actions != "undefined") {
                _.each(this.options.actions, function (currAction) {
                    if (_.indexOf(currAction.event, "hover") >= 0)
                        options.trackMouseHover = true;
                });
            }
            data.getItemMetadata = function (row) {
                if (_.contains(unselectableRowIds, row))
                    return { "selectable":false }
            }

            this.grid = new Slick.Grid(this.el, data, visibleColumns, optionsFixed);

            var classesToAdd = ["s-table"];
            if (options.useHoverStyle)
                classesToAdd.push("s-table-hover")
            if (options.useCondensedStyle)
                classesToAdd.push("s-table-condensed")
            if (options.useStripedStyle)
                classesToAdd.push("s-table-striped")

            this.grid.addClassesToGrid(classesToAdd);
            this.grid.removeClassesFromGrid(["ui-widget"]);

            this.grid.setSelectionModel(new Slick.RowSelectionModel());
            //this.grid.getSelectionModel().setSelectedRows(rowsToSelect);

            var sortedColumns = []
            _.each(self.model.queryState.attributes.sort, function (sortCondition) {
                sortedColumns.push({ columnId:sortCondition.field, sortAsc:sortCondition.order == "asc" })
            });
            this.grid.setSortColumns(sortedColumns);

            this.grid.onSelectedRowsChanged.subscribe(function (e, args) {
                if (!self.discardSelectionEvents)
                    self.onSelectionChanged(args.rows)

                self.discardSelectionEvents = false
            });

            // Column sorting
//    var sortInfo = this.model.queryState.get('sort');
//    // TODO sort is not present in slickgrid
//    if (sortInfo){
//      var column = sortInfo[0].field;
//      var sortAsc = !(sortInfo[0].order == 'desc');
//      this.grid.sort(column, sortAsc);
//    }

            this.grid.onSort.subscribe(function (e, args) {
                var order = (args.sortAsc ? 'asc' : 'desc');
                if (args.sortCol.sorted) {
                    // already ordered! switch ordering
                    if (args.sortCol.sorted == "asc")
                        order = "desc"
                    if (args.sortCol.sorted == "desc")
                        order = "asc"
                }
                var sort = [
                    {
                        field:args.sortCol.field,
                        order:order
                    }
                ];
                self.model.query({sort:sort});
            });

            this.grid.onColumnsReordered.subscribe(function (e, args) {
                self.state.set({columnsOrder:_.pluck(self.grid.getColumns(), 'id')});
            });

            this.grid.onColumnsResized.subscribe(function (e, args) {
                var columns = args.grid.getColumns();
                var defaultColumnWidth = args.grid.getOptions().defaultColumnWidth;
                var columnsWidth = [];
                _.each(columns, function (column) {
                    if (column.width != defaultColumnWidth) {
                        columnsWidth.push({column:column.id, width:column.width});
                    }
                });
                self.state.set({columnsWidth:columnsWidth});
            });

            //
            this.grid.onRowHoverIn.subscribe(function (e, args) {
                //console.log("HoverIn "+args.row)
                var selectedRecords = [];
                selectedRecords.push(self.model.records.models[args.row]);
                var actions = self.options.actions;
                actions.forEach(function (currAction) {
                    currAction.action.doAction(selectedRecords, currAction.mapping);
                });
            });

            var columnpicker = new Slick.Controls.ColumnPicker(columns, this.grid,
                _.extend(options, {state:this.state}));

            if (self.visible) {
                self.grid.init();
                self.rendered = true;
            } else {
                // Defer rendering until the view is visible
                self.rendered = false;
            }

            function resizeSlickGrid() {
                if (self.model.getRecords(self.resultType).length > 0) {
                    var container = self.el.parent();
                    if (typeof container != "undefined" && container != null &&
                        ((container[0].style && container[0].style.height && container[0].style.height.indexOf("%") > 0)
                            || container.hasClass("h100") )) {
                        //console.log("Resizing container height from "+self.el.height()+" to "+self.el.parent()[0].offsetHeight)

                        // force container height to element height
                        self.el.height(self.el.parent()[0].offsetHeight);
                        self.grid.invalidateAllRows();
                        self.grid.resizeCanvas();
                        self.grid.render();
                    }
                }
            }

            resizeSlickGrid();
            //nv.utils.windowResize(resizeSlickGrid);
            this.handleRequestOfRowSelection();

            return this;
        },
        handleRequestOfRowSelection:function () {
            //console.log("handleRequestOfRowSelection")
            this.discardSelectionEvents = true;
            var rowsToSelect = [];
            var myRecords = this.model.getRecords(this.resultType);
            var selRow;
            for (row in myRecords)
                if (myRecords[row].is_selected) {
                    rowsToSelect.push(row)
                    selRow = row
                }

            this.grid.getSelectionModel().setSelectedRows(rowsToSelect)
            if (selRow && this.options.state && this.options.state.selectedCellFocus)
                this.grid.scrollRowToTop(selRow);
        },
        onSelectionChanged:function (rows) {
            var self = this;
            var selectedRecords = [];
            _.each(rows, function (row) {
            	var dataItem = self.grid.getDataItem(row);
                selectedRecords.push(dataItem.__orig_record__);
            });
            var actions = this.options.actions;
            if (actions != null)
                actions.forEach(function (currAction) {
                    currAction.action.doAction(selectedRecords, currAction.mapping);
                });
        },
        show:function () {
            // If the div is hidden, SlickGrid will calculate wrongly some
            // sizes so we must render it explicitly when the view is visible
            if (!this.rendered) {
                if (!this.grid) {
                    this.render();
                }
                this.grid.init();
                this.rendered = true;
            }
            this.visible = true;
        },

        hide:function () {
            this.visible = false;
        }
    });

})(jQuery, recline.View);

/*
 * Context menu for the column picker, adapted from
 * http://mleibman.github.com/SlickGrid/examples/example-grouping
 *
 */
(function ($) {
    function SlickColumnPicker(columns, grid, options) {
        var $menu;
        var columnCheckboxes;

        var defaults = {
            fadeSpeed:250
        };

        function init() {
            grid.onHeaderContextMenu.subscribe(handleHeaderContextMenu);
            options = $.extend({}, defaults, options);

            $menu = $('<ul class="dropdown-menu slick-contextmenu" style="display:none;position:absolute;z-index:20;" />').appendTo(document.body);

            $menu.bind('mouseleave', function (e) {
                $(this).fadeOut(options.fadeSpeed)
            });
            $menu.bind('click', updateColumn);

        }

        function handleHeaderContextMenu(e, args) {
            e.preventDefault();
            $menu.empty();
            columnCheckboxes = [];

            var $li, $input;
            for (var i = 0; i < columns.length; i++) {
                $li = $('<li />').appendTo($menu);
                $input = $('<input type="checkbox" />').data('column-id', columns[i].id).attr('id', 'slick-column-vis-' + columns[i].id);
                columnCheckboxes.push($input);

                if (grid.getColumnIndex(columns[i].id) != null) {
                    $input.attr('checked', 'checked');
                }
                $input.appendTo($li);
                $('<label />')
                    .text(columns[i].name)
                    .attr('for', 'slick-column-vis-' + columns[i].id)
                    .appendTo($li);
            }
            $('<li/>').addClass('divider').appendTo($menu);
            $li = $('<li />').data('option', 'autoresize').appendTo($menu);
            $input = $('<input type="checkbox" />').data('option', 'autoresize').attr('id', 'slick-option-autoresize');
            $input.appendTo($li);
            $('<label />')
                .text('Force fit columns')
                .attr('for', 'slick-option-autoresize')
                .appendTo($li);
            if (grid.getOptions().forceFitColumns) {
                $input.attr('checked', 'checked');
            }

            $menu.css('top', e.pageY - 10)
                .css('left', e.pageX - 10)
                .fadeIn(options.fadeSpeed);
        }

        function updateColumn(e) {
            if ($(e.target).data('option') == 'autoresize') {
                var checked;
                if ($(e.target).is('li')) {
                    var checkbox = $(e.target).find('input').first();
                    checked = !checkbox.is(':checked');
                    checkbox.attr('checked', checked);
                } else {
                    checked = e.target.checked;
                }

                if (checked) {
                    grid.setOptions({forceFitColumns:true});
                    grid.autosizeColumns();
                } else {
                    grid.setOptions({forceFitColumns:false});
                }
                options.state.set({fitColumns:checked});
                return;
            }

            if (($(e.target).is('li') && !$(e.target).hasClass('divider')) ||
                $(e.target).is('input')) {
                if ($(e.target).is('li')) {
                    var checkbox = $(e.target).find('input').first();
                    checkbox.attr('checked', !checkbox.is(':checked'));
                }
                var visibleColumns = [];
                var hiddenColumnsIds = [];
                $.each(columnCheckboxes, function (i, e) {
                    if ($(this).is(':checked')) {
                        visibleColumns.push(columns[i]);
                    } else {
                        hiddenColumnsIds.push(columns[i].id);
                    }
                });


                if (!visibleColumns.length) {
                    $(e.target).attr('checked', 'checked');
                    return;
                }

                grid.setColumns(visibleColumns);
                options.state.set({hiddenColumns:hiddenColumnsIds});
            }
        }

        init();
    }

    // Slick.Controls.ColumnPicker
    $.extend(true, window, { Slick:{ Controls:{ ColumnPicker:SlickColumnPicker }}});
})(jQuery);
this.recline = this.recline || {};
this.recline.View = this.recline.View || {};

(function ($, view) {

    "use strict";

    view.xCharts = Backbone.View.extend({
        template:'<figure style="clear:both; width: {{width}}px; height: {{height}}px;" id="{{uid}}"></figure><div class="xCharts-title-x" style="width:{{width}}px;text-align:center;margin-left:50px">{{xAxisTitle}}</div>',

        initialize:function (options) {

            this.el = $(this.el);
            _.bindAll(this, 'render', 'redraw');


            this.model.bind('change', this.render);
            this.model.fields.bind('reset', this.render);
            this.model.fields.bind('add', this.render);

            this.model.bind('query:done', this.redraw);
            this.model.queryState.bind('selection:done', this.redraw);

            this.uid = options.id || ("d3_" + new Date().getTime() + Math.floor(Math.random() * 10000)); // generating an unique id for the chart

            this.options = options;

            this.height= options.state.height;
            this.width = options.state.width;
            this.xAxisTitle = options.state.xAxisTitle;
            this.yAxisTitle = options.state.yAxisTitle;
            if (options.state.loader)
            	options.state.loader.bindChart(this);
        },

        render:function () {
            //console.log("View.xCharts: render");
            var self = this;
            self.trigger("chart:startDrawing")

            var graphid = "#" + this.uid;
            if (false/*self.graph*/)
            {
            	self.updateGraph();
//                jQuery(graphid).empty();
//                delete self.graph;
//                console.log("View.xCharts: Deleted old graph");
            }
            else
        	{
                var out = Mustache.render(this.template, this);
                this.el.html(out);
        	}
            self.trigger("chart:endDrawing")
        },

        redraw:function () {
            var self = this;
            self.trigger("chart:startDrawing")

            //console.log("View.xCharts: redraw");

            if (false /*self.graph*/)
                self.updateGraph();
            else
                self.renderGraph();

            self.trigger("chart:endDrawing")
        },

        updateGraph:function () {
            //console.log("View.xCharts: updateGraph");
            var self = this;
            self.updateSeries();
            
            if (self.series.main && self.series.main.length && self.series.main[0].data && self.series.main[0].data.length)
        	{
            	this.el.find('figure div.noData').remove()
            	
            	this.el.find('div.xCharts-title-x').html(self.options.state.xAxisTitle)
                var state =  self.options.state;
                self.updateState(state);
                self.graph._options = state.opts;

                self.graph.setData(self.series);
                self.updateOptions();

                self.graph.setType(state.type);

                if(state.legend)
                    self.createLegend();

        	}
            else
        	{
            	// display NO DATA MSG
            	
            	//self.graph.setData(self.series);
                var graphid = "#" + this.uid;
                if (self.graph)
                {
                	// removes resize event or last chart will popup again!
                	d3.select(window).on('resize.for.' + graphid, null);
                	$(graphid).off()
                    $(graphid).empty();
                    delete self.graph;
                }
                this.el.find('figure').html("");
                this.el.find('figure').append(new recline.View.NoDataMsg().create());
                this.el.find('div.xCharts-title-x').html("")
            	self.graph = null
        	}
        },

        updateState: function(state) {
            var self=this;

            if (self.options.state.yAxisTitle)
                state.opts.paddingLeft = 90;  // accomodate space for y-axis title (original values was 60)
        },

        updateOptions: function() {
            var self=this;
            this.el.find('div.xCharts-title-x').html(self.options.state.xAxisTitle)

            // add Y-Axis title
            if (self.options.state.yAxisTitle)
            {
                var fullHeight = self.graph._height + self.graph._options.axisPaddingTop + self.graph._options.axisPaddingBottom

                self.graph._g.selectAll('g.axisY g.titleY').data([self.options.state.yAxisTitle]).enter()
                    .append('g').attr('class', 'titleY').attr('transform', 'translate(-60,'+fullHeight/2+') rotate(-90)')
                    .append('text').attr('x', -3).attr('y', 0).attr('dy', ".32em").attr('text-anchor', "middle").text(function(d) { return d; });
            }
        },

        renderGraph:function () {
            //console.log("View.xCharts: renderGraph");

            var self = this;
            var state = self.options.state;
            self.updateSeries();


            if(state.legend)
                self.createLegend();


            if (self.series.main && self.series.main.length && self.series.main[0].data && self.series.main[0].data.length)
        	{
            		self.el.find('figure div.noData').remove() // remove no data msg (if any) 
            		self.el.find('figure svg g').remove() // remove previous graph (if any)
            		
                    self.updateState(state);

                    self.graph = new xChart(state.type, self.series, '#' + self.uid, state.opts);

                    if (state.interpolation)
                        self.graph._options.interpolation = state.interpolation

                    self.updateOptions();

            }
            else
            {
            	// display NO DATA MSG
                var graphid = "#" + this.uid;
                if (self.graph)
                {
                	// removes resize event or last chart will popup again!
                	d3.select(window).on('resize.for.' + graphid, null);
                	$(graphid).off()
                    $(graphid).empty();
                    delete self.graph;
                }
                this.el.find('figure').html("");
            	this.el.find('figure').append(new recline.View.NoDataMsg().create());
            	this.el.find('div.xCharts-title-x').html("")
            }
        },

        createLegend: function() {
            var self=this;
            var res = $("<div/>");
            var i =0;
            _.each(self.series.main, function(d) {
            	
            	if (d.color){
                	$("<style type='text/css'> " +
                			".color"+i+"{ color:rgb("+d.color.rgb+");} " +
                			".legendcolor"+i+"{ color:rgb("+d.color.rgb+"); background-color:rgb("+d.color.rgb+"); } " +
                			".xchart .color"+i+" .fill { fill:rgba("+d.color.rgb+",0.1);} " +
        					".xchart .color"+i+" .line { stroke:rgb("+d.color.rgb+");} " +    
        					".xchart .color"+i+" rect, .xchart .color"+i+" circle { fill:rgb("+d.color.rgb+");} " +
    					"</style>").appendTo("head");
                	var legendItem = $('<div class="legend_item"/>');
                	var name = $("<span/>");
                	name.html(d.name);
                	legendItem.append(name);
                	var value = $('<div class="legend_item_value"/>');
                	value.addClass("legendcolor"+i);
                	legendItem.append(value);
                	res.append(legendItem);
            	} else {
            		console.log('d.color not defined');
            	}   
            	
                i++;
            })

            self.options.state.legend.html(res);

        },

        updateSeries: function() {
            var self = this;
            var state = self.options.state;
            var series =  recline.Data.SeriesUtility.createSeries(
                state.series,
                state.unselectedColor,
                self.model,
                self.resultType,
                state.group);

            var data = { main: [],
                xScale: state.xScale,
                yScale: state.yScale
            };

            /* series is:
                [ color: , name: , data[ [record:, x:, x_formatted:, y:, y_formatted: ] ]
             */

            _.each( series, function(d) {
                var serie = {color:d.color, name:d.name, data:_.map(d.data, function(c) { return {x:c.x, y:c.y} })};

                data.main.push(serie);
            });

            self.series = data;
        }




    });
})(jQuery, recline.View);/*jshint multistr:true */
this.recline = this.recline || {};
this.recline.View = this.recline.View || {};

(function ($, my) {

    my.CurrentFilter = Backbone.View.extend({
        template:'\
    	<script> \
    	$(function() { \
    		$(".chzn-select-deselect").chosen({allow_single_deselect:true}); \
    	}); \
    	</script> \
      <div"> \
        <fieldset data-filter-field="{{field}}" data-filter-id="{{id}}"> \
			<select class="chzn-select-deselect data-control-id" multiple data-placeholder="{{label}}"> \
            {{#values}} \
            <option value="{{dataset_index}}-{{filter_index}}" selected>{{val}}</option> \
            {{/values}} \
          </select> \
        </fieldset> \
      </div>',
        events:{
            'change .chzn-select-deselect':'onFilterValueChanged'
        },

        initialize:function (args) {
            var self = this;
            this.el = $(this.el);
            _.bindAll(this, 'render');

            this._sourceDatasets = args.models;
            this.uid = args.id || Math.floor(Math.random() * 100000);

            _.each(this._sourceDatasets, function (d) {
                d.bind('query:done', self.render);
                d.queryState.bind('selection:done', self.render);
            });

        },

        render:function () {
            var self = this;
            var tmplData = {
                id:self.uid,
                label:"Active filters"
            };

            var values = [];
            _.each(self._sourceDatasets, function (ds, ds_index) {
                _.each(ds.queryState.getFilters(), function (filter, filter_index) {
                    var v = {dataset_index:ds_index, filter_index:filter_index};
                    v["val"] = self.filterDescription[filter.type](filter, ds);

                    values.push(v);

                });
            });
            tmplData["values"] = values;


            var out = Mustache.render(self.template, tmplData);
            this.el.html(out);
        },

        filterDescription:{
            term:function (filter, dataset) {
                return dataset.fields.get(filter.field).attributes.label + ": " + filter.term;
            },
            range:function (filter, dataset) {
                return dataset.fields.get(filter.field).attributes.label + ": " + filter.start + "-" + filter.stop;
            },
            list:function (filter, dataset) {
                var val = dataset.fields.get(filter.field).attributes.label + ": ";
                _.each(filter.list, function (data, index) {
                    if (index > 0)
                        val += ",";

                    val += data;
                });

                return val;
            }
        },

        onFilterValueChanged:function (e) {
            var self=this;

            e.preventDefault();
            var $target = $(e.target).parent();
           var values = $target.find('.data-control-id')[0][0].value.split("-");

            var dataset_index = values[0];
            var filter_index = values[1];

            self._sourceDatasets[dataset_index].queryState.removeFilter(filter_index);


        }


    });

})(jQuery, recline.View);
this.recline = this.recline || {};
this.recline.View = this.recline.View || {};

(function ($, view) {

    "use strict";

    view.DatePicker = Backbone.View.extend({


        template:'<div style="width: 230px;" id="datepicker-calendar-{{uid}}"></div>',
        fullyInitialized:false,
        maindateFromChanged:false,
        maindateToChanged:false,
        comparedateFromChanged:false,
        comparedateToChanged:false,
        initialize:function (options) {
            this.el = $(this.el);
            _.bindAll(this, 'render', 'redraw', 'redrawCompare', 'calculateMonday');

            if (this.model) {
                this.model.bind('query:done', this.redraw);
                this.model.queryState.bind('selection:done', this.redraw);
            }
            else return;

            if (this.options.compareModel) {
                this.options.compareModel.bind('query:done', this.redrawCompare);
                this.options.compareModel.queryState.bind('selection:done', this.redrawCompare);
            }

            $(window).resize(this.resize);
            this.uid = options.id || (new Date().getTime() + Math.floor(Math.random() * 10000)); // generating an unique id

            var out = Mustache.render(this.template, this);
            this.el.html(out);
        },

        daterange:{
            yesterday:"day",
            lastweeks:"week",
            lastdays:"day",
            lastmonths:"month",
            lastquarters:"quarter",
            lastyears:"year",
            previousyear:"year",
            custom:"day"
        },


        //previousperiod

        onChange:function (view) {
            //console.log("on change")
            var exec = function (data, widget) {
                var value = []
                /*var actions = view.getActionsForEvent("selection");
                 if (actions.length > 0) {
                 var startDate= new Date(parseInt(data.dr1from_millis));
                 var endDate= new Date(parseInt(data.dr1to_millis));
                 var rangetype = view.daterange[data.daterangePreset];

                 value =   [
                 {field: "date", value: [startDate.toString(), endDate.toString()]},
                 {field: "rangetype", value: [rangetype]}
                 ];
                 view.doActions(actions, value );
                 }
                 var actions_compare = view.getActionsForEvent("selection_compare");
                 var value_compare = []
                 if (actions_compare.length > 0) {
                 var rangetype = view.daterange[data.daterangePreset];
                 if(data.comparisonPreset != "previousperiod")
                 rangetype = view.daterange[data.comparisonPreset];

                 value_compare = [{field: "date", value: [null, null]}];

                 if (data.comparisonEnabled) {
                 var startDate= new Date(parseInt(data.dr2from_millis));
                 var endDate= new Date(parseInt(data.dr2to_millis));
                 if(startDate != null && endDate != null)
                 value_compare = [
                 {field: "date", value: [startDate.toString(), endDate.toString()]},
                 {field: "rangetype", value: [rangetype]}
                 ];
                 }

                 view.doActions(actions_compare, value_compare);
                 }*/
                var actions = view.getActionsForEvent("selection")
                if (actions.length > 0) {
                    //reference
                    var startDate_reference = new Date(parseInt(data.dr1from_millis));
                    var endDate_reference = new Date(parseInt(data.dr1to_millis));
                    var rangetype_reference = view.daterange[data.daterangePreset];

                    value = [
                        {field:"date_reference", value:[startDate_reference.toString(), endDate_reference.toString()]},
                        {field:"rangetype_reference", value:[rangetype_reference]}
                    ];

                    var rangetype_compare = rangetype_reference;
                    if (data.comparisonPreset != "previousperiod")
                        rangetype_compare = view.daterange[data.comparisonPreset];

                    if (data.comparisonEnabled) {
                        var startDate_compare = new Date(parseInt(data.dr2from_millis));
                        var endDate_compare = new Date(parseInt(data.dr2to_millis));
                        if (startDate_compare != null && endDate_compare != null) {
                            value.push({field:"date_compare", value:[startDate_compare.toString(), endDate_compare.toString()]});
                            value.push({field:"rangetype_compare", value:[rangetype_compare]});
                        }
                    }
//                    else
//                	{
//                    	// clear values for comparison dates or a redraw event may inadvertently restore them 
//                        $('.dr2.from', view.datepicker).val("");
//                        $('.dr2.to', view.datepicker).val("");
//                        $('.dr2.from_millis', view.datepicker).val("");
//                        $('.dr2.to_millis', view.datepicker).val("");
//                        var values = view.datepicker.data("DateRangesWidget").options.values;
//                        values.dr2from = null;
//                        values.dr2from_millis = null;
//                        values.dr2to = null;
//                        values.dr2to_millis = null;
//                        var datepickerOptions = $(".datepicker.selectableRange").data('datepicker')
//                        datepickerOptions.date = datepickerOptions.date.slice(0, 2) 
//                        $(".datepicker.selectableRange").data('datepicker', datepickerOptions)
//                	}
                    view.doActions(actions, value);
                }


            }
            return exec;
        },

        doActions:function (actions, values) {

            _.each(actions, function (d) {
                d.action.doActionWithValues(values, d.mapping);
            });
        },

        render:function () {
            var self = this;
            var uid = this.uid;

            self.datepicker = $('#datepicker-calendar-' + uid).DateRangesWidget(
                {
                    aggregations:[],
                    values:{
                        comparisonEnabled:false,
                        daterangePreset:"lastweeks",
                        comparisonPreset:"previousperiod"
                    },
                    onChange:self.onChange(self)
                });

            self.redraw();
            self.redrawCompare();
            if (self.options.weeklyMode) {
                var options = $(".datepicker.selectableRange").data('datepicker')
                if (options)
                    options.weeklyMode = self.options.weeklyMode;
                else $(".datepicker.selectableRange").data('datepicker', 'weeklyMode', self.options.weeklyMode)
            }
        },

        redraw:function () {
            //console.log("Widget.datepicker: redraw");
            // todo must use dateranges methods

            if (!this.model || this.model == "undefined")
                return;

            var self = this;
            var dates = $('.date-ranges-picker').DatePickerGetDate();
            if (dates) {
                var period = dates[0];

                var f = self.model.queryState.getFilterByFieldName(self.options.fields.date)
                if (f && f.type == "range") {
                    period[0] = new Date(f.start);
                    period[1] = new Date(f.stop);
                }
                var f = self.model.queryState.getFilterByFieldName(self.options.fields.type)
                if (f && f.type == "term") {
                    // check custom weeks/month

                }


                var values = self.datepicker.data("DateRangesWidget").options.values;


                if (!period[0] || !period[1]) {
                    values.dr1from = "N/A";
                    values.dr1from_millis = "";
                    values.dr1to = "N/A";
                    values.dr1to_millis = "";
                }
                else {
                    values.daterangePreset = "custom";
                    values.dr1from = self.retrieveDateStr(period[0]);
                    values.dr1from_millis = (new Date(period[0])).getTime();
                    values.dr1to = self.retrieveDateStr(period[1]);
                    values.dr1to_millis = (new Date(period[1])).getTime();
                }


                $('.date-ranges-picker').DatePickerSetDate(period, true);

                if (values.dr1from && values.dr1to) {
                    $('span.main', self.datepicker).text(values.dr1from + ' - ' + values.dr1to);
                }
                $('.dr1.from', self.datepicker).val(values.dr1from);
                $('.dr1.to', self.datepicker).val(values.dr1to);
                $('.dr1.from_millis', self.datepicker).val(values.dr1from_millis);
                $('.dr1.to_millis', self.datepicker).val(values.dr1to_millis);


                if (!self.fullyInitialized) {
                    $('.dr1.from').bind("keypress", function (e) {
                        self.maindateFromChanged = true
                    })
                    $('.dr1.to').bind("keypress", function (e) {
                        self.maindateToChanged = true
                    })
                    $('.dr1.from').bind("blur", function (e) {
                        if (self.maindateFromChanged) {
                            if (self.options.weeklyMode) {
                                var monday = self.calculateMonday($(this).val())
                                var sunday = self.calculateSundayFromMonday(monday)
                                var mondayDateStr = self.retrieveDateStr(monday)
                                var sundayDateStr = self.retrieveDateStr(sunday)
                                $('.dr1.from').val(mondayDateStr)
                                $('.dr1.to').val(sundayDateStr)
                                self.applyTextInputDateChange(self.retrieveDateStr(monday), self, true, true)
                                self.applyTextInputDateChange(sundayDateStr, self, true, false)
                            }
                            else self.applyTextInputDateChange($(this).val(), self, true, true)
                            self.maindateFromChanged = false
                        }
                    })
                    $('.dr1.to').bind("blur", function (e) {
                        if (self.maindateToChanged) {
                            if (self.options.weeklyMode) {
                                var monday = self.calculateMonday($(this).val())
                                var sunday = self.calculateSundayFromMonday(monday)
                                var mondayDateStr = self.retrieveDateStr(monday)
                                var sundayDateStr = self.retrieveDateStr(sunday)
                                $('.dr1.from').val(mondayDateStr)
                                $('.dr1.to').val(sundayDateStr)
                                self.applyTextInputDateChange(mondayDateStr, self, true, true)
                                self.applyTextInputDateChange(sundayDateStr, self, true, false)
                            }
                            else self.applyTextInputDateChange($(this).val(), self, true, false)
                            self.maindateToChanged = false
                        }
                    })
                }
            }
        },
        redrawCompare:function () {
            //console.log("Widget.datepicker: redrawcompare");
            var self = this;

            var dates = $('.date-ranges-picker').DatePickerGetDate();
            if (dates) {
                var period = dates[0];
                var values = self.datepicker.data("DateRangesWidget").options.values;
                if (this.options.compareModel) 
                {
                	// If the datepicker is already initialized and a redraw event is issued, 
                	// we must not recreate the compare dates if they already were disabled
                	if (self.fullyInitialized && !values.comparisonEnabled)
            			return;   

                    var f = self.options.compareModel.queryState.getFilterByFieldName(self.options.compareFields.date)
                    if (f && f.type == "range") {
                        period[2] = new Date(f.start);
                        period[3] = new Date(f.stop);
                    }
                    var f = self.model.queryState.getFilterByFieldName(self.options.fields.type)
                    if (f && f.type == "term") {
                        // check custom weeks/month

                    }

                    if (period[2] && period[3]) {
                        values.comparisonEnabled = true;
                        values.comparisonPreset = "custom"
                        values.dr2from = self.retrieveDateStr(period[2]);
                        values.dr2from_millis = (new Date(period[2])).getTime();
                        values.dr2to = self.retrieveDateStr(period[3]);
                        values.dr2to_millis = (new Date(period[3])).getTime();
                        $('.comparison-preset').val("custom")
                    }
                    else {
                        values.comparisonEnabled = false;
                        values.dr2from = "N/A";
                        values.dr2from_millis = "";
                        values.dr2to = "N/A";
                        values.dr2to_millis = "";
                        $('.comparison-preset').val("previousperiod")
                    }

                    $('.date-ranges-picker').DatePickerSetDate(period, true);

                    if (values.comparisonEnabled && values.dr2from && values.dr2to) {
                        $('span.comparison', self.datepicker).text(values.dr2from + ' - ' + values.dr2to);
                        $('span.comparison', self.datepicker).show();
                        $('span.comparison-divider', self.datepicker).show();
                    } else {
                        $('span.comparison-divider', self.datepicker).hide();
                        $('span.comparison', self.datepicker).hide();
                    }

                    $('.dr2.from', self.datepicker).val(values.dr2from);
                    $('.dr2.to', self.datepicker).val(values.dr2to);

                    $('.dr2.from_millis', self.datepicker).val(values.dr2from_millis);
                    $('.dr2.to_millis', self.datepicker).val(values.dr2to_millis);


                    if (!self.fullyInitialized) {
                        $('.dr2.from').bind("keypress", function (e) {
                            self.comparedateFromChanged = true
                        })
                        $('.dr2.to').bind("keypress", function (e) {
                            self.comparedateToChanged = true
                        })
                        $('.dr2.from').bind("blur", function (e) {
                            if (self.comparedateFromChanged) {
                                if (self.options.weeklyMode) {
                                    var monday = self.calculateMonday($(this).val())
                                    var sunday = self.calculateSundayFromMonday(monday)
                                    var mondayDateStr = self.retrieveDateStr(monday)
                                    var sundayDateStr = self.retrieveDateStr(sunday)
                                    $('.dr2.from').val(mondayDateStr)
                                    $('.dr2.to').val(sundayDateStr)
                                    self.applyTextInputDateChange(mondayDateStr, self, false, true)
                                    self.applyTextInputDateChange(sundayDateStr, self, false, false)
                                }
                                else self.applyTextInputDateChange($(this).val(), self, false, true)
                                self.comparedateFromChanged = false
                            }
                        })
                        $('.dr2.to').bind("blur", function (e) {
                            if (self.comparedateToChanged) {
                                if (self.options.weeklyMode) {
                                    var monday = self.calculateMonday($(this).val())
                                    var sunday = self.calculateSundayFromMonday(monday)
                                    var mondayDateStr = self.retrieveDateStr(monday)
                                    var sundayDateStr = self.retrieveDateStr(sunday)
                                    $('.dr2.from').val(mondayDateStr)
                                    $('.dr2.to').val(sundayDateStr)
                                    self.applyTextInputDateChange(mondayDateStr, self, false, true)
                                    self.applyTextInputDateChange(sundayDateStr, self, false, false)
                                }
                                else self.applyTextInputDateChange($(this).val(), self, false, false)
                                self.comparedateToChanged = false
                            }
                        })
                        self.fullyInitialized = true;
                    }
                }
                else {
                    values.comparisonEnabled = true;
                    values.comparisonPreset = "previousperiod"
                    $('.comparison-preset').val("previousperiod")
                    $('.comparison-preset').prop("disabled", true)
                    $('.enable-comparison').css("checked", "checked")
                    $('.enable-comparison').change()
                }
            }
        },
        calculateMonday:function (dateStr) {
            var d = this.retrieveDMYDate(dateStr);
            var day = d.getDay();
            var diff = (day == 0 ? -6 : 1) - day; // adjust when day is sunday
            return new Date(d.getTime() + diff * 24 * 3600000);
        },
        calculateSundayFromMonday:function (monday) {
            return new Date(monday.getTime() + 6 * 24 * 3600000);
        },
        retrieveDMYDate:function (dateStr) {
            // Expect input as d/m/y
            var bits = dateStr.split('\/');
            if (bits.length < 3)
                return null;

            var d = new Date(bits[2], parseInt(bits[1]) - 1, bits[0]);
            if (bits[2] >= 1970 && d && (d.getMonth() + 1) == bits[1] && d.getDate() == Number(bits[0]))
                return d;
            else return null;
        },
        retrieveDateStr:function (d) {
            return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear()
        },
        applyTextInputDateChange:function (currVal, self, isMain, isFrom) {
            //console.log(currVal)
            var d = self.retrieveDMYDate(currVal)
            if (d) {
                //console.log(currVal+ " is VALID!: "+d.toLocaleDateString())
                var options = self.datepicker.data("DateRangesWidget").options
                var datepickerOptions = $(".datepicker.selectableRange").data('datepicker')
                var values = options.values;
                if (isMain) {
                    if (isFrom) {
                        values.dr1from = currVal
                        values.dr1from_millis = d.getTime()
                        $('.dr1.from_millis').val(d.getTime());
                        datepickerOptions.date[0] = d.getTime()
                    }
                    else {
                        values.dr1to = currVal
                        values.dr1to_millis = d.getTime()
                        $('.dr1.to_millis').val(d.getTime());
                        datepickerOptions.date[1] = d.getTime()
                    }
                    if (datepickerOptions.mode == 'tworanges')
                        datepickerOptions.lastSel = 2
                }
                else {
                    if (isFrom) {
                        values.dr2from = currVal
                        values.dr2from_millis = d.getTime()
                        $('.dr2.from_millis').val(d.getTime());
                        datepickerOptions.date[2] = d.getTime()
                    }
                    else {
                        values.dr2to = currVal
                        values.dr2to_millis = d.getTime()
                        $('.dr2.to_millis').val(d.getTime());
                        datepickerOptions.date[3] = d.getTime()
                    }
                    if (datepickerOptions.mode == 'tworanges')
                        datepickerOptions.lastSel = 0
                }
                // scroll month accordingly inside calendar section on the left
                datepickerOptions.current = d;
                // this hack is used to force a refresh of the month calendar, since setmode calls fill() method
                $('.date-ranges-picker').DatePickerSetMode($('.date-ranges-picker').DatePickerGetMode());
            }
            //else console.log(currVal+ " is NOT VALID!")
        },

        getActionsForEvent:function (eventType) {
            var actions = [];

            _.each(this.options.actions, function (d) {
                if (_.contains(d.event, eventType))
                    actions.push(d);
            });

            return actions;
        }


    });
})(jQuery, recline.View);/*jshint multistr:true */
this.recline = this.recline || {};
this.recline.View = this.recline.View || {};

(function ($, my) {

    my.GenericFilter = Backbone.View.extend({
        className:'recline-filter-editor well',
        template:'<div class="filters" style="background-color:{{backgroundColor}}"> \
      <div class="form-stacked js-edit"> \
	  	<div class="label label-info" style="display:{{titlePresent}}" > \
		  	<h4>{{filterDialogTitle}}</h4> \
		  	{{filterDialogDescription}} \
	  	</div> \
        {{#filters}} \
          {{{filterRender}}} \
		  <hr style="display:{{hrVisible}}"> \
        {{/filters}} \
      </div> \
    </div>',
        templateHoriz:'<style> .separated-item { padding-left:20px;padding-right:20px; } </style> <div class="filters" style="background-color:{{backgroundColor}}"> \
      <table > \
	  	<tbody> \
	  		<tr>\
	  			<td class="separated-item" style="display:{{titlePresent}}">\
				  	<div class="label label-info"> \
					  	<h4>{{filterDialogTitle}}</h4> \
					  	{{filterDialogDescription}} \
				  	</div> \
				</td>\
			  	{{#filters}} \
			  	<td class="separated-item">\
          			{{{filterRender}}} \
          		</td>\
  				{{/filters}} \
        	</tr>\
  		</tbody>\
  	   </table> \
    </div> ',
        filterTemplates:{
            term:' \
      <div class="filter-{{type}} filter" id="{{ctrlId}}"> \
        <fieldset data-filter-field="{{field}}" data-filter-id="{{id}}" data-filter-type="{{type}}" data-control-type="{{controlType}}"> \
            <legend style="display:{{useLegend}}">{{label}}</legend>  \
    		<div style="float:left;padding-right:10px;padding-top:2px;display:{{useLeftLabel}}">{{label}}</div> \
          <input type="text" value="{{term}}" name="term" class="data-control-id" /> \
          <input type="button" class="btn" id="setFilterValueButton" value="Set"></input> \
        </fieldset> \
      </div> \
    ',
            slider:' \
	<script> \
		$(document).ready(function(){ \
			$( "#slider{{ctrlId}}" ).slider({ \
				min: {{min}}, \
				max: {{max}}, \
				value: {{term}}, \
				slide: function( event, ui ) { \
					$( "#amount{{ctrlId}}" ).html( "{{label}}: "+ ui.value ); \
				} \
			}); \
			$( "#amount{{ctrlId}}" ).html( "{{label}}: "+ $( "#slider{{ctrlId}}" ).slider( "value" ) ); \
		}); \
	</script> \
      <div class="filter-{{type}} filter" id="{{ctrlId}}" style="min-width:100px"> \
        <fieldset data-filter-field="{{field}}" data-filter-id="{{id}}" data-filter-type="{{type}}" data-control-type="{{controlType}}"> \
            <legend style="display:{{useLegend}}">{{label}} \
			<a class="js-remove-filter" href="#" title="Remove this filter">&times;</a> \
		</legend>  \
		  <label id="amount{{ctrlId}}">{{label}}: </label> \
		  <div id="slider{{ctrlId}}" class="data-control-id"></div> \
		  <br> \
          <input type="button" class="btn" id="setFilterValueButton" value="Set"></input> \
        </fieldset> \
      </div> \
    ',
            slider_styled:' \
	<style> \
		 .layout-slider { padding-bottom:15px;width:150px } \
	</style> \
	<script> \
		$(document).ready(function(){ \
			$( "#slider{{ctrlId}}" ).jslider({ \
				from: {{min}}, \
				to: {{max}}, \
				scale: [{{min}},"|","{{step1}}","|","{{mean}}","|","{{step3}}","|",{{max}}], \
				step: {{step}}, \
				limits: false, \
				skin: "plastic" \
			}); \
		}); \
	</script> \
      <div class="filter-{{type}} filter" id="{{ctrlId}}"> \
        <fieldset data-filter-field="{{field}}" data-filter-id="{{id}}" data-filter-type="{{type}}" data-control-type="{{controlType}}"> \
            <legend style="display:{{useLegend}}">{{label}} \
			<a class="js-remove-filter" href="#" title="Remove this filter">&times;</a> \
		</legend>  \
		<div style="float:left;padding-right:15px;display:{{useLeftLabel}}">{{label}} \
			<a class="js-remove-filter" href="#" title="Remove this filter">&times;</a> \
		</div> \
	    <div style="float:left" class="layout-slider" > \
	    	<input type="slider" id="slider{{ctrlId}}" value="{{term}}" class="slider-styled data-control-id" /> \
	    </div> \
        </fieldset> \
      </div> \
    ',
            range:' \
      <div class="filter-{{type}} filter" id="{{ctrlId}}"> \
        <fieldset data-filter-field="{{field}}" data-filter-id="{{id}}" data-filter-type="{{type}}" data-control-type="{{controlType}}"> \
            <legend style="display:{{useLegend}}">{{label}}</legend>  \
          <label class="control-label" for="">From</label> \
          <input type="text" value="{{start}}" name="start"  class="data-control-id-from" style="width:auto"/> \
          <label class="control-label" for="">To</label> \
          <input type="text" value="{{stop}}" name="stop" class="data-control-id-to"  style="width:auto"/> \
		  <br> \
          <input type="button" class="btn" id="setFilterValueButton" value="Set"></input> \
        </fieldset> \
      </div> \
    ',
            range_slider:' \
	<script> \
		$(document).ready(function(){ \
			$( "#slider-range{{ctrlId}}" ).slider({ \
				range: true, \
				min: {{min}}, \
				max: {{max}}, \
				values: [ {{from}}, {{to}} ], \
				slide: function( event, ui ) { \
					$( "#amount{{ctrlId}}" ).html(  "{{label}}: " + ui.values[ 0 ] + " - " + ui.values[ 1 ] ); \
				} \
			}); \
			$( "#amount{{ctrlId}}" ).html(  "{{label}}: " + $( "#slider-range{{ctrlId}}" ).slider( "values", 0 ) + " - " + $( "#slider-range{{ctrlId}}" ).slider( "values", 1 ) ); \
		}); \
	</script> \
      <div class="filter-{{type}} filter" id="{{ctrlId}}" style="min-width:100px"> \
        <fieldset data-filter-field="{{field}}" data-filter-id="{{id}}" data-filter-type="{{type}}" data-control-type="{{controlType}}"> \
            <legend style="display:{{useLegend}}">{{label}}</legend>  \
		  <label id="amount{{ctrlId}}">{{label}} range: </label> \
		  <div id="slider-range{{ctrlId}}" class="data-control-id" ></div> \
		  <br> \
          <input type="button" class="btn" id="setFilterValueButton" value="Set"></input> \
        </fieldset> \
      </div> \
    ',
            range_slider_styled:' \
	<style> \
	 .layout-slider { padding-bottom:15px;width:150px } \
	</style> \
	<script> \
		$(document).ready(function(){ \
			$( "#slider{{ctrlId}}" ).jslider({ \
				from: {{min}}, \
				to: {{max}}, \
				scale: [{{min}},"|","{{step1}}","|","{{mean}}","|","{{step3}}","|",{{max}}], \
				limits: false, \
				step: {{step}}, \
				skin: "round_plastic", \
			}); \
		}); \
	</script> \
      <div class="filter-{{type}} filter" id="{{ctrlId}}"> \
        <fieldset data-filter-field="{{field}}" data-filter-id="{{id}}" data-filter-type="{{type}}" data-control-type="{{controlType}}"> \
            <legend style="display:{{useLegend}}">{{label}} \
		</legend>  \
		<div style="float:left;padding-right:15px;display:{{useLeftLabel}}">{{label}}</div> \
	    <div style="float:left" class="layout-slider" > \
	    	<input type="slider" id="slider{{ctrlId}}" value="{{from}};{{to}}" class="slider-styled data-control-id" /> \
	    </div> \
        </fieldset> \
      </div> \
    ',
            month_week_calendar:' \
	  <style> \
		.list-filter-item { cursor:pointer; } \
		.list-filter-item:hover { background: lightblue;cursor:pointer; } \
	  </style> \
      <div class="filter-{{type}} filter" id="{{ctrlId}}"> \
        <fieldset data-filter-field="{{field}}" data-filter-id="{{id}}" data-filter-type="{{type}}" data-control-type="{{controlType}}"> \
            <legend style="display:{{useLegend}}">{{label}}  \
            <a class="js-remove-filter" href="#" title="Remove this filter">&times;</a> \
			</legend> \
			Year<br> \
			<select class="drop-down2 fields data-control-id" > \
            {{#yearValues}} \
            <option value="{{val}}" {{selected}}>{{val}}</option> \
            {{/yearValues}} \
          </select> \
			<br> \
			Type<br> \
			<select class="drop-down3 fields" > \
				{{#periodValues}} \
				<option value="{{val}}" {{selected}}>{{val}}</option> \
				{{/periodValues}} \
			</select> \
			<br> \
			<div style="max-height:500px;width:100%;border:1px solid grey;overflow:auto;"> \
				<table class="table table-striped table-hover table-condensed" style="width:100%" data-filter-field="{{field}}" data-filter-id="{{id}}" data-filter-type="{{type}}" data-control-type="{{controlType}}"> \
				<tbody>\
				{{#values}} \
				<tr class="{{selected}}"><td class="list-filter-item " myValue="{{val}}" startDate="{{startDate}}" stopDate="{{stopDate}}">{{label}}</td></tr> \
				{{/values}} \
				</tbody> \
			  </table> \
		  </div> \
	    </fieldset> \
      </div> \
	',
            range_calendar:' \
	<script> \
	$(function() { \
		$( "#from{{ctrlId}}" ).datepicker({ \
			defaultDate: "{{startDate}}", \
			changeMonth: true, \
			numberOfMonths: 1, \
			dateFormat: "D M dd yy", \
			onSelect: function( selectedDate ) { \
				$( "#to{{ctrlId}}" ).datepicker( "option", "minDate", selectedDate ); \
			} \
		}); \
		$( "#to{{ctrlId}}" ).datepicker({ \
			defaultDate: "{{endDate}}", \
			changeMonth: true, \
			numberOfMonths: 1, \
			dateFormat: "D M dd yy", \
			onSelect: function( selectedDate ) { \
				$( "#from{{ctrlId}}" ).datepicker( "option", "maxDate", selectedDate ); \
			} \
		}); \
	}); \
	</script> \
      <div class="filter-{{type}} filter" id="{{ctrlId}}"> \
        <fieldset data-filter-field="{{field}}" data-filter-id="{{id}}" data-filter-type="{{type}}" data-control-type="{{controlType}}"> \
            <legend style="display:{{useLegend}}">{{label}}</legend>  \
			<label for="from{{ctrlId}}">From</label> \
			<input type="text" id="from{{ctrlId}}" name="from{{ctrlId}}" class="data-control-id-from" value="{{startDate}}" style="width:auto"/> \
			<br> \
			<label for="to{{ctrlId}}">to</label> \
			<input type="text" id="to{{ctrlId}}" name="to{{ctrlId}}" class="data-control-id-to" value="{{endDate}}" style="width:auto"/> \
 		  <br> \
          <input type="button" class="btn" id="setFilterValueButton" value="Set"></input> \
       </fieldset> \
      </div> \
	',
            dropdown:' \
      <script>  \
    	function updateColor(elem) { \
    		if (elem.prop("selectedIndex") == 0) elem.addClass("dimmed"); else elem.removeClass("dimmed"); \
  		} \
      </script> \
      <div class="filter-{{type}} filter" id="{{ctrlId}}"> \
        <fieldset data-filter-field="{{field}}" data-filter-id="{{id}}" data-filter-type="{{type}}" data-control-type="{{controlType}}"> \
            <legend style="display:{{useLegend}}">{{label}} \
    		</legend>  \
    		<div style="float:left;padding-right:10px;padding-top:2px;display:{{useLeftLabel}}">{{label}}</div> \
    		<select class="drop-down fields data-control-id dimmed" onchange="updateColor($(this))"> \
			<option class="dimmedDropDownText">{{innerLabel}}</option> \
            {{#values}} \
            <option class="normalDropDownText" value="{{val}}" {{selected}}>{{valCount}}</option> \
            {{/values}} \
          </select> \
        </fieldset> \
      </div> \
    ',
            dropdown_styled:' \
    	<script> \
    	$(function() { \
    		$(".chzn-select-deselect").chosen({allow_single_deselect:true}); \
    	}); \
    	</script> \
      <div class="filter-{{type}} filter" id="{{ctrlId}}"> \
        <fieldset data-filter-field="{{field}}" data-filter-id="{{id}}" data-filter-type="{{type}}" data-control-type="{{controlType}}"> \
            <legend style="display:{{useLegend}}">{{label}}</legend>  \
			<div style="float:left;padding-right:10px;padding-top:3px;display:{{useLeftLabel}}">{{label}}</div> \
    		<select class="chzn-select-deselect data-control-id" data-placeholder="{{innerLabel}}"> \
    		<option></option> \
            {{#values}} \
            <option value="{{val}}" {{selected}}>{{valCount}}</option> \
            {{/values}} \
          </select> \
        </fieldset> \
      </div> \
    ',
            dropdown_date_range:' \
      <div class="filter-{{type}} filter" id="{{ctrlId}}"> \
        <fieldset data-filter-field="{{field}}" data-filter-id="{{id}}" data-filter-type="{{type}}" data-control-type="{{controlType}}"> \
            <legend style="display:{{useLegend}}">{{label}} \
    		</legend>  \
    		<div style="float:left;padding-right:10px;padding-top:3px;display:{{useLeftLabel}}">{{label}}</div> \
			<select class="drop-down fields data-control-id" > \
			<option></option> \
            {{#date_values}} \
            <option startDate="{{startDate}}" stopDate="{{stopDate}}" {{selected}}>{{val}}</option> \
            {{/date_values}} \
          </select> \
        </fieldset> \
      </div> \
    ',
            list:' \
	  <style> \
		.list-filter-item { cursor:pointer; } \
		.list-filter-item:hover { background: lightblue;cursor:pointer; } \
	  </style> \
      <div class="filter-{{type}} filter" id="{{ctrlId}}"> \
        <fieldset data-filter-field="{{field}}" data-filter-id="{{id}}" data-filter-type="{{type}}" data-control-type="{{controlType}}"> \
            <legend style="display:{{useLegend}}">{{label}}  \
            <a class="js-remove-filter" href="#" title="Remove this filter">&times;</a> \
			</legend> \
    		<div style="float:left;padding-right:10px;display:{{useLeftLabel}}">{{label}} \
    			<a class="js-remove-filter" href="#" title="Remove this filter">&times;</a> \
    		</div> \
			<div style="max-height:500px;width:100%;border:1px solid grey;overflow:auto;"> \
				<table class="table table-striped table-hover table-condensed" style="width:100%" data-filter-field="{{field}}" data-filter-id="{{id}}" data-filter-type="{{type}}" > \
				<tbody>\
				{{#values}} \
				<tr class="{{selected}}"><td class="list-filter-item" >{{val}}</td><td style="text-align:right">{{count}}</td></tr> \
				{{/values}} \
				</tbody>\
			  </table> \
		  </div> \
	    </fieldset> \
      </div> \
	',
            listbox:' \
      <div class="filter-{{type}} filter" id="{{ctrlId}}"> \
        <fieldset data-filter-field="{{field}}" data-filter-id="{{id}}" data-filter-type="{{type}}" data-control-type="{{controlType}}"> \
            <legend style="display:{{useLegend}}">{{label}}</legend>  \
    		<div style="float:left;padding-right:10px;display:{{useLeftLabel}}">{{label}}</div> \
			<select class="fields data-control-id"  multiple SIZE=10> \
            {{#values}} \
            <option value="{{val}}" {{selected}}>{{valCount}}</option> \
            {{/values}} \
          </select> \
		  <br> \
          <input type="button" class="btn" id="setFilterValueButton" value="Set"></input> \
        </fieldset> \
      </div> \
    ',
            listbox_styled:' \
    	<script> \
    	$(function() { \
    		$(".chzn-select-deselect").chosen({allow_single_deselect:true}); \
    	}); \
    	</script> \
      <div class="filter-{{type}} filter" id="{{ctrlId}}"> \
        <fieldset data-filter-field="{{field}}" data-filter-id="{{id}}" data-filter-type="{{type}}" data-control-type="{{controlType}}"> \
            <legend style="display:{{useLegend}}">{{label}} \
    		</legend>  \
    		<div style="float:left;padding-right:10px;padding-top:4px;display:{{useLeftLabel}}">{{label}}</div> \
			<select class="chzn-select-deselect data-control-id" multiple data-placeholder="{{innerLabel}}"> \
            {{#values}} \
            <option value="{{val}}" {{selected}}>{{valCount}}</option> \
            {{/values}} \
          </select> \
        </fieldset> \
      </div> \
    ',
            radiobuttons:' \
        <div class="filter-{{type}} filter" id="{{ctrlId}}"> \
            <fieldset data-filter-field="{{field}}" data-filter-id="{{id}}" data-filter-type="{{type}}" data-control-type="{{controlType}}"> \
                <legend style="display:{{useLegend}}">{{label}}</legend>  \
    			<div style="float:left;padding-right:10px;padding-top:4px;display:{{useLeftLabel}}">{{label}}</div> \
    			<div class="btn-group data-control-id" > \
            		{{#useAllButton}} \
            		<button class="btn btn-mini grouped-button btn-primary">All</button> \
            		{{/useAllButton}} \
    	            {{#values}} \
    	    		<button class="btn btn-mini grouped-button {{selected}}" val="{{value}}" {{tooltip}}>{{{val}}}</button> \
    	            {{/values}} \
              	</div> \
            </div> \
        </div> \
        ',
         hierarchic_radiobuttons:' \
        <div class="filter-{{type}} filter" id="{{ctrlId}}"> \
            <fieldset data-filter-field="{{field}}" data-filter-id="{{id}}" data-filter-type="{{type}}" data-control-type="{{controlType}}"> \
                <legend style="display:{{useLegend}}">{{label}}</legend>  \
    			<div style="float:left;padding-right:10px;padding-top:4px;display:{{useLeftLabel}}">{{label}}</div> \
    			<div class="btn-group data-control-id" level="1" style="float:left"> \
            		{{#useAllButton}} \
            		<button class="btn btn-mini grouped-button btn-primary">All</button> \
            		{{/useAllButton}} \
    	            {{#values}} \
    	    		<button class="btn btn-mini grouped-button {{selected}}" val="{{value}}" {{tooltip}}>{{{val}}}</button> \
    	            {{/values}} \
              	</div> \
        		{{#useLevel2}} \
	    			<div class="btn-group level2" level="2" style="float:left;display:{{showLevel2}}"> \
     		{{#useAllButton}} \
        	 			<button class="btn btn-mini grouped-button {{all2Selected}}" val="">All</button> \
     		{{/useAllButton}} \
			            {{#valuesLev2}} \
	            			<button class="btn btn-mini grouped-button {{selected}}" val="{{value}}" {{tooltip}}>{{{val}}}</button> \
			            {{/valuesLev2}} \
	            	</div> \
            		{{#useLevel3}} \
		    			<div class="btn-group level3" level="3" style="float:left;display:{{showLevel3}}"> \
      		{{#useAllButton}} \
	            			<button class="btn btn-mini grouped-button {{all3Selected}}" val="">All</button> \
     		{{/useAllButton}} \
				            {{#valuesLev3}} \
			        			<button class="btn btn-mini grouped-button {{selected}}" val="{{value}}" {{tooltip}}>{{{val}}}</button> \
				            {{/valuesLev3}} \
			        	</div> \
            		{{/useLevel3}} \
        		{{/useLevel2}} \
            </div> \
        </div> \
        ',
        multibutton:' \
    <div class="filter-{{type}} filter" id="{{ctrlId}}"> \
        <fieldset data-filter-field="{{field}}" data-filter-id="{{id}}" data-filter-type="{{type}}" data-control-type="{{controlType}}"> \
    		<legend style="display:{{useLegend}}">{{label}} \
    		</legend>  \
    		<div style="float:left;padding-right:10px;padding-top:4px;display:{{useLeftLabel}}">{{label}}</div> \
    		<div class="btn-group data-control-id" > \
	            {{#values}} \
	    		<button class="btn btn-mini grouped-button {{selected}}" val="{{value}}" {{tooltip}}>{{{val}}}</button> \
	            {{/values}} \
          </div> \
        </fieldset> \
    </div> \
    ',
            legend:' \
	  <style> \
      .legend-item { \
					border-top:2px solid black;border-left:2px solid black; \
					border-bottom:2px solid darkgrey;border-right:2px solid darkgrey; \
					width:16px;height:16px;padding:1px;margin:5px; \
					opacity: 0.85 \
					}  \
	 .legend-item.not-selected { background-color:transparent !important; } /* the idea is that the color "not-selected" overrides the original color (this way we may use a global style) */ \
	  </style> \
      <div class="filter-{{type}} filter" id="{{ctrlId}}"> \
        <fieldset data-filter-field="{{field}}" data-filter-id="{{id}}" data-filter-type="{{type}}" data-control-type="{{controlType}}"> \
            <legend style="display:{{useLegend}}">{{label}}</legend>  \
			<div style="float:left;padding-right:10px;display:{{useLeftLabel}}">{{label}}</div> \
			<table style="width:100%;background-color:transparent">\
			{{#values}} \
				<tr> \
				<td style="width:25px"><div class="legend-item {{notSelected}}" myValue="{{val}}" style="background-color:{{color}}"></td> \
				<td style="vertical-align:middle"><label style="color:{{color}};text-shadow: black 1px 1px, black -1px -1px, black -1px 1px, black 1px -1px, black 0px 1px, black 0px -1px, black 1px 0px, black -1px 0px">{{val}}</label></td>\
				<td><label style="text-align:right">[{{count}}]</label></td>\
				</tr>\
			{{/values}}\
			</table> \
	    </fieldset> \
      </div> \
	',
            color_legend:' \
	<div class="filter-{{type}} filter" style="width:{{totWidth2}}px;max-height:{{totHeight2}}px"> \
        <fieldset data-filter-field="{{field}}" data-filter-id="{{id}}" data-filter-type="{{type}}"> \
            <legend style="display:{{useLegend}}">{{label}}</legend>  \
				<div style="float:left;padding-right:10px;height:{{lineHeight}}px;display:{{useLeftLabel}}"> \
					<label style="line-height:{{lineHeight}}px">{{label}}</label> \
				</div> \
				<div style="width:{{totWidth}}px;height:{{totHeight}}px;display:inline"> \
					<svg height="{{totHeight}}" xmlns="http://www.w3.org/2000/svg"> \
					{{#colorValues}} \
				    	<rect width="{{width}}" height={{lineHeight}} fill="{{color}}" x="{{x}}" y={{y}}/> \
						<text width="{{width}}" fill="{{textColor}}" x="{{x}}" y="{{yplus30}}">{{val}}</text> \
					{{/colorValues}}\
					</svg>		\
				</div> \
	    </fieldset> \
	</div> \
	'
        },

        FiltersTemplate:{
            "range_calendar":{ needFacetedField:false},
            "month_week_calendar":{ needFacetedField:true},
            "list":{ needFacetedField:true},
            "legend":{ needFacetedField:true},
            "dropdown":{ needFacetedField:true},
            "dropdown_styled":{ needFacetedField:true},
            "dropdown_date_range":{ needFacetedField:false},
            "listbox":{ needFacetedField:true},
            "listbox_styled":{ needFacetedField:true},
            "term":{ needFacetedField:false},
            "range":{ needFacetedField:true},
            "slider":{ needFacetedField:true},
            "range_slider":{ needFacetedField:true},
            "range_slider_styled":{ needFacetedField:true},
            "color_legend":{ needFacetedField:true},
            "multibutton":{ needFacetedField:true},
            "radiobuttons":{ needFacetedField:false},
            "hierarchic_radiobuttons":{ needFacetedField:false}
        },

        events:{
            'click .js-remove-filter':'onRemoveFilter',
            'click .js-add-filter':'onAddFilterShow',
            'click #addFilterButton':'onAddFilter',
            'click .list-filter-item':'onListItemClicked',
            'click .legend-item':'onLegendItemClicked',
            'click #setFilterValueButton':'onFilterValueChanged',
            'change .drop-down':'onFilterValueChanged',
            'change .chzn-select-deselect':'onFilterValueChanged',
            'change .drop-down2':'onListItemClicked',
            'change .drop-down3':'onPeriodChanged',
            'click .grouped-button':'onButtonsetClicked',
            'change .slider-styled':'onStyledSliderValueChanged'
        },

        activeFilters:new Array(),
        _sourceDataset:null,
        _selectedClassName:"info", // use bootstrap ready-for-use classes to highlight list item selection (avail classes are success, warning, info & error)

        initialize:function (args) {
            this.el = $(this.el);
            _.bindAll(this, 'render');
            _.bindAll(this, 'update');
            _.bindAll(this, 'getFieldType');
            _.bindAll(this, 'onRemoveFilter');
            _.bindAll(this, 'onPeriodChanged');
            _.bindAll(this, 'findActiveFilterByField');

            _.bindAll(this, 'updateDropdown');
            _.bindAll(this, 'updateDropdownStyled');
            _.bindAll(this, 'updateSlider');
            _.bindAll(this, 'updateSliderStyled');
            _.bindAll(this, 'updateRadiobuttons');
            _.bindAll(this, 'updateRangeSlider');
            _.bindAll(this, 'updateRangeSliderStyled');
            _.bindAll(this, 'updateRangeCalendar');
            _.bindAll(this, 'updateMonthWeekCalendar');
            _.bindAll(this, 'updateDropdownDateRange');
            _.bindAll(this, 'updateList');
            _.bindAll(this, 'updateListbox');
            _.bindAll(this, 'updateListboxStyled');
            _.bindAll(this, 'updateLegend');
            _.bindAll(this, 'updateMultibutton');
            _.bindAll(this, 'redrawGenericControl');
            _.bindAll(this, 'fixHierarchicRadiobuttonsSelections');

            this._sourceDataset = args.sourceDataset;
            this.uid = args.id || Math.floor(Math.random() * 100000); // unique id of the view containing all filters
            this.numId = 0; // auto-increasing id used for a single filter

            this.sourceFields = args.sourceFields;
            if (args.state) {
                this.filterDialogTitle = args.state.title;
                this.filterDialogDescription = args.state.description;
                this.useHorizontalLayout = args.state.useHorizontalLayout;
                this.showBackground = args.state.showBackground;
                if (this.showBackground == false) {
                    $(this).removeClass("well");
                    $(this.el).removeClass("well");
                }

                this.backgroundColor = args.state.backgroundColor;
            }
            this.activeFilters = new Array();

            this._actions = args.actions;

            if (this.sourceFields && this.sourceFields.length)
                for (var k in this.sourceFields)
                    this.addNewFilterControl(this.sourceFields[k]);

            // not all filters required a source of data
            if (this._sourceDataset) {
                this._sourceDataset.bind('query:done', this.render);
                this._sourceDataset.queryState.bind('selection:done', this.update);
            }
        },

        areValuesEqual:function (a, b) {
            // this also handles date equalities.
            // For instance comparing a Date obj with its corresponding timer value now returns true
            if (typeof a == "undefined" || typeof b == "undefined")
                return false;

            if (a == b)
                return true;
            if (a && a.valueOf() == b)
                return true;
            if (b && a == b.valueOf())
                return true;
            if (a && b && a.valueOf == b.valueOf())
                return true;

            return false;
        },

        update:function () {
            var self = this;
            // retrieve filter values (start/from/term/...)
            _.each(this._sourceDataset.queryState.get('selections'), function (filter) {
                for (var j in self.activeFilters) {
                    if (self.activeFilters[j].field == filter.field) {
                        self.activeFilters[j].list = filter.list
                        self.activeFilters[j].term = filter.term
                        self.activeFilters[j].start = filter.start
                        self.activeFilters[j].stop = filter.stop
                        self.fixHierarchicRadiobuttonsSelections(self.activeFilters[j])
                    }
                }
            });

            var currFilters = this.el.find("div.filter");
            _.each(currFilters, function (flt) {
                var currFilterCtrl = $(flt).find(".data-control-id");
                if (typeof currFilterCtrl != "undefined" && currFilterCtrl != null) {
                    //console.log($(currFilterCtrl));
                }
                else {
                    var currFilterCtrlFrom = $(flt).find(".data-control-id-from");
                    var currFilterCtrlTo = $(flt).find(".data-control-id-to");
                }
                var currActiveFilter = null;
                for (var j in self.activeFilters) {
                    if (self.activeFilters[j].ctrlId == flt.id) {
                        currActiveFilter = self.activeFilters[j]
                        break;
                    }
                }
                if (currActiveFilter != null) {
                    if (currActiveFilter.userChanged) {
                        // skip the filter that triggered the change
                        currActiveFilter.userChanged = undefined;
                        return;
                    }
                    switch (currActiveFilter.controlType) {
                        // term
                        case "dropdown" :
                            return self.updateDropdown($(flt), currActiveFilter, $(currFilterCtrl));
                        case "dropdown_styled" :
                            return self.updateDropdownStyled($(flt), currActiveFilter, $(currFilterCtrl));
                        case "slider" :
                            return self.updateSlider($(flt), currActiveFilter, $(currFilterCtrl));
                        case "slider_styled" :
                            return self.updateSliderStyled($(flt), currActiveFilter, $(currFilterCtrl));
                        case "radiobuttons" :
                            return self.updateRadiobuttons($(flt), currActiveFilter, $(currFilterCtrl));
                        case "hierarchic_radiobuttons" :
                            return self.updateHierarchicRadiobuttons($(flt), currActiveFilter, $(currFilterCtrl));
                        // range
                        case "range_slider" :
                            return self.updateRangeSlider($(flt), currActiveFilter, $(currFilterCtrl));
                        case "range_slider_styled" :
                            return self.updateRangeSliderStyled($(flt), currActiveFilter, $(currFilterCtrl));
                        case "range_calendar" :
                            return self.updateRangeCalendar($(flt), currActiveFilter, $(currFilterCtrlFrom), $(currFilterCtrlTo));
                        case "month_week_calendar" :
                            return self.updateMonthWeekCalendar($(flt), currActiveFilter, $(currFilterCtrl));
                        case "dropdown_date_range" :
                            return self.updateDropdownDateRange($(flt), currActiveFilter, $(currFilterCtrl));
                        // list
                        case "list" :
                            return self.updateList($(flt), currActiveFilter, $(currFilterCtrl));
                        case "listbox":
                            return self.updateListbox($(flt), currActiveFilter, $(currFilterCtrl));
                        case "listbox_styled":
                            return self.updateListboxStyled($(flt), currActiveFilter, $(currFilterCtrl));
                        case "legend" :
                            return self.updateLegend($(flt), currActiveFilter, $(currFilterCtrl));
                        case "multibutton" :
                            return self.updateMultibutton($(flt), currActiveFilter, $(currFilterCtrl));
                    }
                }
            });
        },

        computeUserChoices:function (currActiveFilter) {
            var valueList = currActiveFilter.list;
            if ((typeof valueList == "undefined" || valueList == null) && currActiveFilter.term)
                valueList = [currActiveFilter.term];

            return valueList;
        },

        redrawGenericControl:function (filterContainer, currActiveFilter) {
            var out = this.createSingleFilter(currActiveFilter);
            filterContainer.parent().html(out);
        },

        updateDropdown:function (filterContainer, currActiveFilter, filterCtrl) {
            var valueList = this.computeUserChoices(currActiveFilter);

            if (valueList != null && valueList.length == 1) {
                filterCtrl[0].style.color = "";
                filterCtrl.val(currActiveFilter.list[0]);
            }
            else
                filterCtrl.find("option:first").prop("selected", "selected");

            if (filterCtrl.prop("selectedIndex") == 0)
                filterCtrl.addClass("dimmed");
            else filterCtrl.removeClass("dimmed");
        },
        updateDropdownStyled:function (filterContainer, currActiveFilter, filterCtrl) {
            this.redrawGenericControl(filterContainer, currActiveFilter);
        },
        updateSlider:function (filterContainer, currActiveFilter, filterCtrl) {
            var valueList = this.computeUserChoices(currActiveFilter);
            if (valueList != null && valueList.length == 1) {
                filterCtrl.slider("value", valueList[0]);
                $("#amount" + currActiveFilter.ctrlId).html(currActiveFilter.label + ": " + valueList[0]); // sistema di riserva
                filterCtrl.trigger("slide", filterCtrl); // non pare funzionare
            }
        },
        updateSliderStyled:function (filterContainer, currActiveFilter, filterCtrl) {
            var valueList = this.computeUserChoices(currActiveFilter);
            if (valueList != null && valueList.length == 1)
                filterCtrl.jslider("value", valueList[0]);
        },
        updateHierarchicRadiobuttons:function (filterContainer, currActiveFilter, filterCtrl) {
            this.redrawGenericControl(filterContainer, currActiveFilter);
        },
        updateRadiobuttons:function (filterContainer, currActiveFilter, filterCtrl) {
            var valueList = this.computeUserChoices(currActiveFilter);

            var buttons = filterCtrl.find("button.grouped-button");
            _.each(buttons, function (btn) {
                $(btn).removeClass("btn-primary")
            });
            if (valueList != null) {
                if (valueList.length == 1) {
                    // do not use each or other jquery/underscore methods since they don't work well here
                    for (var i = 0; i < buttons.length; i++) {
                        var btn = $(buttons[i]);
                        for (var j = 0; j < valueList.length; j++) {
                            var v = valueList[j];
                            if (this.areValuesEqual(v, btn.html())) {
                                btn.addClass("btn-primary");
                                break;
                            }
                        }
                    }
                }
                else if (valueList.length == 0 && !currActiveFilter.noAllButton)
                    $(buttons[0]).addClass("btn-primary"); // select button "All" if present
            }
            else if (!currActiveFilter.noAllButton)
            	$(buttons[0]).addClass("btn-primary"); // select button "All" if present
        },
        updateRangeSlider:function (filterContainer, currActiveFilter, filterCtrl) {
            var valueList = this.computeUserChoices(currActiveFilter);
            if (valueList != null && valueList.length == 2) {
                filterCtrl.slider("values", 0, valueList[0]);
                filterCtrl.slider("values", 1, valueList[1]);
                $("#amount" + currActiveFilter.ctrlId).html(currActiveFilter.label + ": " + valueList[0] + " - " + valueList[1]); // sistema di riserva
                filterCtrl.trigger("slide", filterCtrl); // non pare funzionare
            }
        },
        updateRangeSliderStyled:function (filterContainer, currActiveFilter, filterCtrl) {
            var valueList = this.computeUserChoices(currActiveFilter);
            if (valueList != null && valueList.length == 2)
                filterCtrl.jslider("value", valueList[0], valueList[1]);
        },
        updateRangeCalendar:function (filterContainer, currActiveFilter, filterCtrlFrom, filterCtrlTo) {
            this.redrawGenericControl(filterContainer, currActiveFilter);
        },
        updateMonthWeekCalendar:function (filterContainer, currActiveFilter, filterCtrl) {
            this.redrawGenericControl(filterContainer, currActiveFilter);
        },
        updateDropdownDateRange:function (filterContainer, currActiveFilter, filterCtrl) {
            this.redrawGenericControl(filterContainer, currActiveFilter);
        },
        updateList:function (filterContainer, currActiveFilter, filterCtrl) {
            this.redrawGenericControl(filterContainer, currActiveFilter);
        },
        updateListbox:function (filterContainer, currActiveFilter, filterCtrl) {
            this.redrawGenericControl(filterContainer, currActiveFilter);
        },
        updateListboxStyled:function (filterContainer, currActiveFilter, filterCtrl) {
            this.redrawGenericControl(filterContainer, currActiveFilter);
        },
        updateLegend:function (filterContainer, currActiveFilter, filterCtrl) {
            this.redrawGenericControl(filterContainer, currActiveFilter);
        },
        updateMultibutton:function (filterContainer, currActiveFilter, filterCtrl) {
            var valueList = this.computeUserChoices(currActiveFilter);

            var buttons = filterCtrl.find("button.grouped-button");
            _.each(buttons, function (btn) {
                $(btn).removeClass("btn-info")
            });

            // from now on, do not use each or other jquery/underscore methods since they don't work well here
            if (valueList != null)
                for (var i = 0; i < buttons.length; i++) {
                    var btn = $(buttons[i]);
                    for (var j = 0; j < valueList.length; j++) {
                        var v = valueList[j];
                        if (this.areValuesEqual(v, btn.html()))
                            btn.addClass("btn-info");
                    }
                }
        },

        filterRender:function () {
            return this.self.createSingleFilter(this); // make sure you pass the current active filter
        },
        createSingleFilter:function (currActiveFilter) {
            var self = currActiveFilter.self;

            //check facet
            var filterTemplate = self.FiltersTemplate[currActiveFilter.controlType];
            var facetTerms;

            if (!filterTemplate)
                throw("GenericFilter: Invalid control type " + currActiveFilter.controlType);

            if (filterTemplate.needFacetedField) {
                currActiveFilter.facet = self._sourceDataset.getFacetByFieldId(currActiveFilter.field);

                if (currActiveFilter.facet == null)
                    throw "GenericFilter: no facet present for field [" + currActiveFilter.field + "]. Define a facet before filter render"
                
                if (currActiveFilter.fieldType == "integer" || currActiveFilter.fieldType == "number") // sort if numeric (Chrome issue)
                	currActiveFilter.facet.attributes.terms = _.sortBy(currActiveFilter.facet.attributes.terms, function(currObj) {
                		return currObj.term;
                	});
                    
                facetTerms = currActiveFilter.facet.attributes.terms;
                if (typeof currActiveFilter.label == "undefined" || currActiveFilter.label == null)
                    currActiveFilter.label = currActiveFilter.field;
            } else if(self._sourceDataset) {
                // if facet are not defined i use all dataset records


            }

            currActiveFilter.useLegend = "block";
            if (currActiveFilter.labelPosition != 'top')
                currActiveFilter.useLegend = "none";

            currActiveFilter.useLeftLabel = "none";
            if (currActiveFilter.labelPosition == 'left')
                currActiveFilter.useLeftLabel = "block";

            if (currActiveFilter.labelPosition == 'inside')
                currActiveFilter.innerLabel = currActiveFilter.label;

            currActiveFilter.values = new Array();

            // add value list to selected filter or templating of record values will not work
            if (currActiveFilter.controlType.indexOf('calendar') >= 0) {
                if (currActiveFilter.start)
                    currActiveFilter.startDate = self.dateConvert(currActiveFilter.start);

                if (currActiveFilter.stop)
                    currActiveFilter.endDate = self.dateConvert(currActiveFilter.stop);
            }
            if (currActiveFilter.controlType.indexOf('slider') >= 0) {
                if (facetTerms.length > 0 && typeof facetTerms[0].term != "undefined") {
                    currActiveFilter.max = facetTerms[0].term;
                    currActiveFilter.min = facetTerms[0].term;
                }
                else {
                    currActiveFilter.max = 100;
                    currActiveFilter.min = 0;
                }
            }

            if (currActiveFilter.controlType == "month_week_calendar") {
                currActiveFilter.weekValues = [];
                currActiveFilter.periodValues = [
                    {val:"Months", selected:(currActiveFilter.period == "Months" ? "selected" : "")},
                    {val:"Weeks", selected:(currActiveFilter.period == "Weeks" ? "selected" : "")}
                ]
                var currYear = currActiveFilter.year;
                var januaryFirst = new Date(currYear, 0, 1);
                var januaryFirst_time = januaryFirst.getTime();
                var weekOffset = januaryFirst.getDay();
                var finished = false;
                for (var w = 0; w <= 53 && !finished; w++) {
                    var weekStartTime = januaryFirst_time + 7 * 86400000 * (w - 1) + (7 - weekOffset) * 86400000;
                    var weekEndTime = weekStartTime + 7 * 86400000;
                    if (w == 0)
                        weekStartTime = januaryFirst_time;

                    if (new Date(weekEndTime).getFullYear() > currYear) {
                        weekEndTime = new Date(currYear + 1, 0, 1).getTime();
                        finished = true;
                    }
                    currActiveFilter.weekValues.push({val:w + 1,
                        label:"" + (w + 1) + " [" + d3.time.format("%x")(new Date(weekStartTime)) + " -> " + d3.time.format("%x")(new Date(weekEndTime - 1000)) + "]",
                        startDate:new Date(weekStartTime),
                        stopDate:new Date(weekEndTime),
                        selected:(currActiveFilter.term == w + 1 ? self._selectedClassName : "")
                    });
                }

                currActiveFilter.monthValues = [];
                for (m = 1; m <= 12; m++) {
                    var endYear = currYear;
                    var endMonth = m;
                    if (m == 12) {
                        endYear = currYear + 1;
                        endMonth = 0;
                    }
                    currActiveFilter.monthValues.push({ val:d3.format("02d")(m),
                        label:d3.time.format("%B")(new Date(m + "/01/2012")) + " " + currYear,
                        startDate:new Date(currYear, m - 1, 1, 0, 0, 0, 0),
                        stopDate:new Date(endYear, endMonth, 1, 0, 0, 0, 0),
                        selected:(currActiveFilter.term == m ? self._selectedClassName : "")
                    });
                }
                if (currActiveFilter.period == "Months")
                    currActiveFilter.values = currActiveFilter.monthValues;
                else if (currActiveFilter.period == "Weeks")
                    currActiveFilter.values = currActiveFilter.weekValues;

                currActiveFilter.yearValues = [];
                var startYear = 2010;
                var endYear = parseInt(d3.time.format("%Y")(new Date()))
                for (var y = startYear; y <= endYear; y++)
                    currActiveFilter.yearValues.push({val:y, selected:(currActiveFilter.year == y ? "selected" : "")});

            }
            else if (currActiveFilter.controlType == "dropdown_date_range") {
                currActiveFilter.date_values = [];

                var defaultDateFilters = [
                    { label:'This week', start:"sunday", stop:"next sunday"},
                    { label:'This month', start:"1", delta:{months:1}},
                    { label:'This year', start:"january 1", delta:{years:1}},
                    { label:'Past week', stop:"sunday", delta:{days:-7}},
                    { label:'Past month', stop:"1", delta:{months:-1}},
                    { label:'Past 2 months', stop:"1", delta:{months:-2}},
                    { label:'Past 3 months', stop:"1", delta:{months:-3}},
                    { label:'Past 6 months', stop:"1", delta:{months:-6}},
                    { label:'Past year', stop:"january 1", delta:{years:-1}},
                    { label:'Last 7 days', start:"-6", stop:"t +1 d"},
                    { label:'Last 30 days', start:"-29", stop:"t +1 d"},
                    { label:'Last 90 days', start:"-89", stop:"t +1 d"},
                    { label:'Last 365 days', start:"-1 y", stop:"t +1 d"},
                ]
                var fullDateFilters = defaultDateFilters;
                if (currActiveFilter.skipDefaultFilters)
                    fullDateFilters = [];

                if (currActiveFilter.userFilters)
                    fullDateFilters = fullDateFilters.concat(currActiveFilter.userFilters);

                for (var i in fullDateFilters) {
                    var flt = fullDateFilters[i];
                    var startDate = null;
                    var stopDate = null;
                    if (flt.start && flt.stop) {
                        startDate = Date.parse(flt.start);
                        stopDate = Date.parse(flt.stop);
                    }
                    else if (flt.start && flt.delta) {
                        startDate = Date.parse(flt.start);
                        if (startDate) {
                            stopDate = new Date(startDate);
                            stopDate.add(flt.delta);
                        }
                    }
                    else if (flt.stop && flt.delta) {
                        stopDate = Date.parse(flt.stop);
                        if (stopDate) {
                            startDate = new Date(stopDate);
                            startDate.add(flt.delta);
                        }
                    }
                    if (startDate && stopDate && flt.label)
                        currActiveFilter.date_values.push({ val:flt.label,
                            startDate:startDate,
                            stopDate:stopDate
                        });
                }
                for (var j in currActiveFilter.date_values)
                    if (currActiveFilter.date_values[j].val == currActiveFilter.term) {
                        currActiveFilter.date_values[j].selected = self._selectedClassName;
                        break;
                    }
            }
            else if (currActiveFilter.controlType == "legend") {
                // this code somehow works but it's not correct
                currActiveFilter.tmpValues = _.pluck(currActiveFilter.facet.attributes.terms, "term");

                if (typeof currActiveFilter.origLegend == "undefined") {
                    currActiveFilter.origLegend = currActiveFilter.tmpValues;
                    currActiveFilter.legend = currActiveFilter.origLegend;
                }
                currActiveFilter.tmpValues = currActiveFilter.origLegend;
                var legendSelection = currActiveFilter.legend;
                for (var i in currActiveFilter.tmpValues) {
                    var v = currActiveFilter.tmpValues[i];
                    var notSelected = "";
                    if ((currActiveFilter.fieldType != "date" && legendSelection.indexOf(v) < 0)
                        || (currActiveFilter.fieldType == "date" && legendSelection.indexOf(v) < 0 && legendSelection.indexOf(new Date(v).valueOf()) < 0))
                        notSelected = "not-selected";

                    currActiveFilter.values.push({val:v, notSelected:notSelected, color:currActiveFilter.facet.attributes.terms[i].color, count:currActiveFilter.facet.attributes.terms[i].count});
                }
            }
            else if (currActiveFilter.controlType == "color_legend") {
                var ruler = document.getElementById("my_string_width_calculation_ruler");
                if (typeof ruler == "undefined" || ruler == null) {
                    ruler = document.createElement("span");
                    ruler.setAttribute('id', "my_string_width_calculation_ruler");
                    ruler.style.visibility = "hidden";
                    ruler.style.width = "auto";
                    document.body.appendChild(ruler);
                }
                var maxWidth = 250;
                currActiveFilter.colorValues = [];
                
                

                currActiveFilter.tmpValues = _.pluck(currActiveFilter.facet.attributes.terms, "term");

                var pixelW = 0;
                // calculate needed pixel width for every string
                for (var i in currActiveFilter.tmpValues) {
                    var v = currActiveFilter.tmpValues[i];
                    ruler.innerHTML = v;
                    var w = ruler.offsetWidth
                    if (w > pixelW)
                        pixelW = w;
                }
                pixelW += 2;
                currActiveFilter.lineHeight = 40;

                // calculate needed row number and columns per row
                var maxColsPerRow = Math.floor(maxWidth / pixelW);
                var totRighe = Math.ceil(currActiveFilter.tmpValues.length / maxColsPerRow);
                var colsPerRow = Math.ceil(currActiveFilter.tmpValues.length / totRighe);
                currActiveFilter.totWidth = colsPerRow * pixelW;
                currActiveFilter.totWidth2 = currActiveFilter.totWidth + (currActiveFilter.labelPosition == 'left' ? currActiveFilter.label.length * 10 : 10)
                currActiveFilter.totHeight = totRighe * currActiveFilter.lineHeight;
                currActiveFilter.totHeight2 = currActiveFilter.totHeight + 40;

                var riga = 0;
                var colonna = 0;

                for (var i in currActiveFilter.tmpValues) {
                    var v = currActiveFilter.tmpValues[i];
                    var color = currActiveFilter.facet.attributes.terms[i].color;
                    if (colonna == colsPerRow) {
                        riga++;
                        colonna = 0;
                    }
                    currActiveFilter.colorValues.push({width:pixelW, color:color, textColor:self.complementColor(color),
                        val:v, x:pixelW * colonna, y:riga * currActiveFilter.lineHeight, yplus30:riga * currActiveFilter.lineHeight + 25 });

                    colonna++;
                }
            }
            else if (currActiveFilter.controlType == "hierarchic_radiobuttons") {
                var lev1Values = []
                var fullLevelValues = []
                var totLevels = 1;
                var userSelection = null;
                if (currActiveFilter.term)
                	userSelection = currActiveFilter.term
                else if (typeof currActiveFilter.list != "undefined" && currActiveFilter.list && currActiveFilter.list.length == 1) 
                	userSelection = currActiveFilter.list[0];
                	
            	_.each(self._sourceDataset.getRecords(), function(record) {
                    var field = self._sourceDataset.fields.get(currActiveFilter.field);
                    if(!field) {
                        throw "widget.genericfilter: unable to find field ["+currActiveFilter.field+"] in dataset";
                    }

                    var v = record.getFieldValue(field);
                    var shape = record.getFieldShape(field, false, false);
                    fullLevelValues.push(v);
                    if (v.indexOf(currActiveFilter.separator) < 0)
                    	lev1Values.push({value: v, record: record, shape: shape});
                    else
                	{
                    	var valueSet = v.split(currActiveFilter.separator);
                        var lev1Val = valueSet[0]
                        if (_.find(lev1Values, function(currVal){ return currVal.value == lev1Val }))
                        	{ /* skip already present */ }
                        else 
                    	{
                        	lev1Values.push({value: lev1Val, record: null, shape: shape});
                        	if (valueSet.length > totLevels)
                        		totLevels = valueSet.length
                    	}
                	}
            	});
            	if (totLevels > 1)
        		{
            		currActiveFilter.useLevel2 = true;
            		currActiveFilter.showLevel2 = "none";
            		currActiveFilter.all2Selected = "btn-primary";
        		}
            	if (totLevels > 2)
        		{
            		currActiveFilter.useLevel3 = true;
            		currActiveFilter.showLevel3 = "none";
            		currActiveFilter.all3Selected = "btn-primary";
        		}
            	// populate level 1
            	_.each(lev1Values, function(lev1Val) {
                    var selected = "";
                    var v = lev1Val.value;
                    var val = v;
                    var record = lev1Val.record;
                    
                	if (userSelection && userSelection != "" && self.areValuesEqual(userSelection.split(currActiveFilter.separator)[0], v))
                        selected = 'btn-primary'
                        	
                    if (currActiveFilter.useShapeOnly == true)
                	{
                        var shape = lev1Val.shape;
                    	if (shape && shape.indexOf("undefined") < 0)
                    	{
                        	tooltip = "rel=tooltip title="+v
                        	v = "<div class='shape'>"+shape+"</div>"
                    	}
                    	else v = "<div class='shapeH'>"+v+"</div>"
                	}
                    currActiveFilter.values.push({value: val, val:v, record:record, selected:selected, valCount: v, tooltip: tooltip });
                });
            	// handle user selection
            	if (userSelection && userSelection != "")
        		{
            		currActiveFilter.valuesLev2 = []
            		var userSelectionParts = userSelection.split(currActiveFilter.separator)
            		var subValues = _.filter(fullLevelValues, function(currVal){ return currVal.indexOf(userSelectionParts[0] + currActiveFilter.separator) == 0 })
            		if (subValues && subValues.length)
        			{
            			// 2 or more levels
            			// populate level 2
            			currActiveFilter.showLevel2 = "block";
                		_.each(subValues, function(subValue) {
                            var selected = "";
                            var subValueParts = subValue.split(currActiveFilter.separator) 
                            var v = subValueParts[1];
                            var val = v;
                            if (_.find(currActiveFilter.valuesLev2, function(valueLev2) { return valueLev2.value == v}))
                        	{
                            	// do nothing. Item already present
                        	}
                            else
                        	{
                                var record = null;
                                if (subValueParts.length == 2)
                            	{
                                	record = _.find(self._sourceDataset.getRecords(), function(record) {
                                        var field = self._sourceDataset.fields.get(currActiveFilter.field);
                                        var currV = record.getFieldValue(field);
                                        return currV == subValue; 
                                	});
                            	}
                                if (self.areValuesEqual(userSelectionParts[0], subValueParts[0]) && self.areValuesEqual(userSelectionParts[1], subValueParts[1]))
                            	{
                                    selected = 'btn-primary'
                                    currActiveFilter.all2Selected = ""
                            	}
                                if (currActiveFilter.useShapeOnly == true)
                            	{
                                	var shape = record.getFieldShape(field, false, false);
                                	if (shape && shape.indexOf("undefined") < 0)
                                	{
                                    	tooltip = "rel=tooltip title="+v
                                    	v = "<div class='shape'>"+shape+"</div>"
                                	}
                                	else v = "<div class='shapeH'>"+v+"</div>"
                            	}
                    			currActiveFilter.valuesLev2.push({value: val, val:v, selected:selected, valCount: v, tooltip: tooltip, record: record });
                        		// check if 3 levels must be shown
                    			if (subValueParts.length >= 2 && userSelectionParts.length >= 2)
                    			{
                            		var subSubValues = _.filter(fullLevelValues, function(currVal){ return currVal.indexOf(userSelectionParts[0] + currActiveFilter.separator + userSelectionParts[1]) == 0 })
                            		if (subSubValues && subSubValues.length)
                        			{
                            			// populate level 3
                            			currActiveFilter.showLevel3 = "block";
                            			currActiveFilter.valuesLev3 = []
	                            		_.each(subSubValues, function(subSubValue) {
	                                        var selected = "";
	                                        var subValueParts = subSubValue.split(currActiveFilter.separator) 
	                                        var v = subValueParts[2];
	                                        var val = v;
	                                        if (_.find(currActiveFilter.valuesLev3, function(valueLev3) { return valueLev3.value == v}))
	                                    	{
	                                        	// do nothing. Item already present
	                                    	}
	                                        else
	                                    	{
	                                            var record = null;
	                                            if (subValueParts.length == 3)
	                                        	{
	                                            	record = _.find(self._sourceDataset.getRecords(), function(record) {
	                                                    var field = self._sourceDataset.fields.get(currActiveFilter.field);
	                                                    var currV = record.getFieldValue(field);
	                                                    return currV == subSubValue; 
	                                            	});
	                                        	}
	                                            if (self.areValuesEqual(userSelection, subSubValue))
	                                        	{
	                                                selected = 'btn-primary'
	                                                currActiveFilter.all2Selected = ""
	                                        	}
	                                            if (currActiveFilter.useShapeOnly == true)
	                                        	{
	                                            	var shape = record.getFieldShape(field, false, false);
	                                            	if (shape && shape.indexOf("undefined") < 0)
	                                            	{
	                                                	tooltip = "rel=tooltip title="+v
	                                                	v = "<div class='shape'>"+shape+"</div>"
	                                            	}
	                                            	else v = "<div class='shapeH'>"+v+"</div>"
	                                        	}
	                                			currActiveFilter.valuesLev3.push({value: val, val:v, selected:selected, valCount: v, tooltip: tooltip, record: record });
	                                    	}
	                            		})
                        			}
                    			}
                        	}
                		})
        			}
        		}
            }
            else {
                var lastV = null;
                currActiveFilter.step = null;

                if(facetTerms) {
                    for (var i in facetTerms) {
                        var selected = "";
                        var tooltip = "";
                        var v = facetTerms[i].term;
                        var val = v;
                        var count = facetTerms[i].count
                        if (currActiveFilter.controlType == "list") {
                            if (count > 0)
                                selected = self._selectedClassName;
                        }
                        else if (currActiveFilter.controlType == "radiobuttons") {
                            if (self.areValuesEqual(currActiveFilter.term, v) || (typeof currActiveFilter.list != "undefined" && currActiveFilter.list && currActiveFilter.list.length == 1 && self.areValuesEqual(currActiveFilter.list[0], v)))
                                selected = 'btn-primary'
                            
                            if (currActiveFilter.useShapeOnly == true)
                            	if (facetTerms[i].shape && facetTerms[i].shape.indexOf("undefined") < 0)
	                        	{
	                            	tooltip = "rel=tooltip title="+v
	                            	v = "<div class='shape'>"+facetTerms[i].shape+"</div>"
	                        	}
                            	else v = "<div class='shapeH'>"+v+"</div>"
                        }
                        else if (currActiveFilter.controlType == "multibutton") {
                            if (self.areValuesEqual(currActiveFilter.term, v))
                                selected = 'btn-info'
                            else if (typeof currActiveFilter.list != "undefined" && currActiveFilter.list != null) {
                                for (var j in currActiveFilter.list)
                                    if (self.areValuesEqual(currActiveFilter.list[j], v))
                                        selected = 'btn-info'
                            }
                            if (currActiveFilter.useShapeOnly == true)
                            	if (facetTerms[i].shape && facetTerms[i].shape.indexOf("undefined") < 0)
	                        	{
	                            	tooltip = "rel=tooltip title="+v
	                            	v = "<div class='shape'>"+facetTerms[i].shape+"</div>"
	                        	}
                            	else v = "<div class='shapeH'>"+v+"</div>"
                        }
                        else if (currActiveFilter.controlType == "dropdown" || currActiveFilter.controlType == "dropdown_styled") {
                            if (self.areValuesEqual(currActiveFilter.term, v) || (typeof currActiveFilter.list != "undefined" && currActiveFilter.list && currActiveFilter.list.length == 1 && self.areValuesEqual(currActiveFilter.list[0], v)))
                                selected = "selected"
                        }
                        else if (currActiveFilter.controlType == "listbox" || currActiveFilter.controlType == "listbox_styled") {
                            if (self.areValuesEqual(currActiveFilter.term, v))
                                selected = "selected"
                            else if (typeof currActiveFilter.list != "undefined" && currActiveFilter.list != null) {
                                for (var j in currActiveFilter.list)
                                    if (self.areValuesEqual(currActiveFilter.list[j], v))
                                        selected = "selected"
                            }
                        }
                        if (currActiveFilter.showCount)
                            currActiveFilter.values.push({value: val, val:v, selected:selected, valCount: v+"\t["+count+"]", count: "["+count+"]", tooltip: tooltip });
                        else currActiveFilter.values.push({value: val, val:v, selected:selected, valCount: v, tooltip: tooltip });

                        if (currActiveFilter.controlType.indexOf('slider') >= 0) {
                            if (v > currActiveFilter.max)
                                currActiveFilter.max = v;

                            if (v < currActiveFilter.min)
                                currActiveFilter.min = v;

                            if (currActiveFilter.controlType.indexOf('styled') > 0 && lastV != null) {
                                if (currActiveFilter.step == null)
                                    currActiveFilter.step = v - lastV;
                                else if (v - lastV != currActiveFilter.step)
                                    currActiveFilter.step = 1;
                            }
                        }
                        lastV = v;
                    }
                } else if(self._sourceDataset) {
                    _.each(self._sourceDataset.getRecords(), function(record) {
                        var selected = "";
                        var tooltip = "";
                        var field = self._sourceDataset.fields.get(currActiveFilter.field);
                        if(!field) {
                            throw "widget.genericfilter: unable to find field ["+currActiveFilter.field+"] in dataset";
                        }

                        var v = record.getFieldValue(field);
                        var val = v;
                        if (currActiveFilter.controlType == "radiobuttons") {
                            if (self.areValuesEqual(currActiveFilter.term, v) || (typeof currActiveFilter.list != "undefined" && currActiveFilter.list && currActiveFilter.list.length == 1 && self.areValuesEqual(currActiveFilter.list[0], v)))
                                selected = 'btn-primary'
                                	
                            if (currActiveFilter.useShapeOnly == true)
                        	{
                            	var shape = record.getFieldShape(field, false, false);
                            	if (shape && shape.indexOf("undefined") < 0)
	                        	{
	                            	tooltip = "rel=tooltip title="+v
	                            	v = "<div class='shape'>"+shape+"</div>"
	                        	}
                            	else v = "<div class='shapeH'>"+v+"</div>"
                        	}
                        }
                        else if (currActiveFilter.controlType == "multibutton") {
                            if (self.areValuesEqual(currActiveFilter.term, v))
                                selected = 'btn-info'
                            else if (typeof currActiveFilter.list != "undefined" && currActiveFilter.list != null) {
                                for (var j in currActiveFilter.list)
                                    if (self.areValuesEqual(currActiveFilter.list[j], v))
                                        selected = 'btn-info'
                            }
                            if (currActiveFilter.useShapeOnly == true)
                        	{
                            	var shape = record.getFieldShape(field, false, false);
                            	if (shape && shape.indexOf("undefined") < 0)
	                        	{
	                            	tooltip = "rel=tooltip title="+v
	                            	v = "<div class='shape'>"+shape+"</div>"
	                        	}
                            	else v = "<div class='shapeH'>"+v+"</div>"
                        	}
                        }
                        else if (currActiveFilter.controlType == "dropdown" || currActiveFilter.controlType == "dropdown_styled") {
                            if (self.areValuesEqual(currActiveFilter.term, v) || (typeof currActiveFilter.list != "undefined" && currActiveFilter.list && currActiveFilter.list.length == 1 && self.areValuesEqual(currActiveFilter.list[0], v)))
                                selected = "selected"
                        }
                        else if (currActiveFilter.controlType == "listbox" || currActiveFilter.controlType == "listbox_styled") {
                            if (self.areValuesEqual(currActiveFilter.term, v))
                                selected = "selected"
                            else if (typeof currActiveFilter.list != "undefined" && currActiveFilter.list != null) {
                                for (var j in currActiveFilter.list)
                                    if (self.areValuesEqual(currActiveFilter.list[j], v))
                                        selected = "selected"
                            }
                        }
                        currActiveFilter.values.push({value: val, val:v, record:record, selected:selected, valCount: v, tooltip: tooltip });

                        if (currActiveFilter.controlType.indexOf('slider') >= 0) {
                            if (v > currActiveFilter.max)
                                currActiveFilter.max = v;

                            if (v < currActiveFilter.min)
                                currActiveFilter.min = v;

                            if (currActiveFilter.controlType.indexOf('styled') > 0 && lastV != null) {
                                if (currActiveFilter.step == null)
                                    currActiveFilter.step = v - lastV;
                                else if (v - lastV != currActiveFilter.step)
                                    currActiveFilter.step = 1;
                            }
                        }
                        lastV = v;

                    })
                } else {
                    throw "widget.genericfilter: nor facet or dataset present to build filter"
                }

                if (currActiveFilter.controlType.indexOf('slider') >= 0) {
                    if (typeof currActiveFilter.from == "undefined")
                        currActiveFilter.from = currActiveFilter.min;

                    if (typeof currActiveFilter.to == "undefined")
                        currActiveFilter.to = currActiveFilter.max;

                    if (typeof currActiveFilter.term == "undefined")
                        currActiveFilter.term = currActiveFilter.min;

                    if (currActiveFilter.controlType.indexOf('styled') > 0) {
                        if (currActiveFilter.min % 2 == 0 && currActiveFilter.max % 2 == 0) {
                            currActiveFilter.step1 = (currActiveFilter.max - currActiveFilter.min) / 4 + currActiveFilter.min
                            currActiveFilter.mean = (currActiveFilter.max - currActiveFilter.min) / 2
                            currActiveFilter.step2 = (currActiveFilter.max - currActiveFilter.min) * 3 / 4 + currActiveFilter.min
                            if (currActiveFilter.step1 != Math.floor(currActiveFilter.step1) || currActiveFilter.step2 != Math.floor(currActiveFilter.step2)) {
                                currActiveFilter.step1 = "|"
                                currActiveFilter.step2 = "|"
                            }
                        }
                        else {
                            currActiveFilter.step1 = "|"
                            currActiveFilter.mean = "|"
                            currActiveFilter.step2 = "|"
                        }
                    }
                }
            }
            currActiveFilter.ctrlId = self.uid + "_" + self.numId;
            self.numId++;

            return Mustache.render(self.filterTemplates[currActiveFilter.controlType], currActiveFilter);
        },
        fixHierarchicRadiobuttonsSelections:function(filter) {
        	var self = this;
            // ensures previous hierarchic_radiobutton selections are retained, if any (coming from the session cookie) [PART 1]
            if (filter.controlType == "hierarchic_radiobuttons" && filter.type == "list"
            	&& filter.list && filter.list.length > 1)
        	{
            	var valueParts = filter.list[0].split(filter.separator)
            	if (valueParts.length > 1)
        		{
                	var commonSelection = valueParts.splice(0, valueParts.length - 1).join(filter.separator)
                	var lung = commonSelection.length
                	var allRecordsFound = true
                	var allRecords = self._sourceDataset.getRecords() 
                	for (var r in allRecords)
            		{
                		var record = allRecords[r]
                        var field = self._sourceDataset.fields.get(filter.field);
                        var currV = record.getFieldValue(field);
                        if (currV.substring(0, lung) === commonSelection)
                    	{
                        	if (!_.contains(filter.list, currV))
                    		{
                            	allRecordsFound = false;
                            	break;
                    		}
                    	}
            		}
                	if (allRecordsFound)
                		filter.term = commonSelection
        		}
        	}
        	
        },
        

        render:function () {
            var self = this;
            var tmplData = {filters:this.activeFilters};
            _.each(tmplData.filters, function (flt) {
                flt.hrVisible = 'block';
                flt.self = self; // pass self to filters!
            });

            //  map them to the correct controlType and retain their values (start/from/term/...)
            if (self._sourceDataset) {
                _.each(self._sourceDataset.queryState.get('selections'), function (filter) {
                    for (var j in tmplData.filters) {
                        if (tmplData.filters[j].field == filter.field) {
                            tmplData.filters[j].list = filter.list
                            tmplData.filters[j].term = filter.term
                            tmplData.filters[j].start = filter.start
                            tmplData.filters[j].stop = filter.stop
                            self.fixHierarchicRadiobuttonsSelections(tmplData.filters[j])
                        }
                    }
                });

                tmplData.fields = this._sourceDataset.fields.toJSON();

            }

            if (tmplData.filters.length > 0)
                tmplData.filters[tmplData.filters.length - 1].hrVisible = 'none'

            var resultType = "filtered";
            if (self.options.resultType !== null)
                resultType = self.options.resultType;

            tmplData.filterDialogTitle = this.filterDialogTitle;
            tmplData.filterDialogDescription = this.filterDialogDescription;
            if (this.filterDialogTitle || this.filterDialogDescription)
                tmplData.titlePresent = "block";
            else tmplData.titlePresent = "none";
            tmplData.dateConvert = self.dateConvert;
            tmplData.filterRender = self.filterRender;
            var currTemplate = this.template;
            if (this.useHorizontalLayout)
                currTemplate = this.templateHoriz

            if (self.showBackground == false) {
                self.className = self.className.replace("well", "")
                $(self).removeClass("well");
                $(self.el).removeClass("well");
            }
            else {
                tmplData.backgroundColor = self.backgroundColor;
                if (self.showBackground == true) {
                    if (self.className.indexOf("well") < 0)
                        self.className += " well";

                    $(self).addClass("well");
                    $(self.el).addClass("well");
                }
            }

            var out = Mustache.render(currTemplate, tmplData);
            this.el.html(out);
            
            // ensures previous hierarchic_radiobutton selections are retained, if any (coming from the session cookie) [PART 2]
            _.each(tmplData.filters, function(currActiveFilter) {
                if (currActiveFilter.controlType == "hierarchic_radiobuttons" && currActiveFilter.type == "list" 
                	&& currActiveFilter.list && currActiveFilter.list.length > 1)
            	{
                    var flt;
                    if (currActiveFilter.ctrlId)
                    	flt = self.el.find("#"+currActiveFilter.ctrlId);
                    else flt = this.el.find("div.filter");
                    
            		var currFilterCtrl = $(flt).find(".data-control-id");
            		self.updateHierarchicRadiobuttons($(flt), currActiveFilter, $(currFilterCtrl));                		
            	}
            });
        },

        complementColor:function (c) {
            // calculates a readable color to use over a given color
            // usually returns black for light colors and white for dark colors.
//	  var c1 = c.hsv();
//	  if (c1[2] >= 0.5)
//		  return chroma.hsv(c1[0],c1[1],0);
//	  else return chroma.hsv(c1[0],c1[1],1);
            var c1 = c.rgb;
            if (c1[0] + c1[1] + c1[2] < 255 * 3 / 2)
                return "white";
            else return "black";
        },
        onButtonsetClicked:function (e) {
            e.preventDefault();
            var self = this;
            var $target = $(e.currentTarget);
            var $fieldSet = $target.parent().parent();
            var type = $fieldSet.attr('data-filter-type');
            var fieldId = $fieldSet.attr('data-filter-field');
            var controlType = $fieldSet.attr('data-control-type');
            if (controlType == "hierarchic_radiobuttons")
        	{
                // ensure one and only one selection is performed
                var classToUse = "btn-primary"
                $target.parent().find('button.' + classToUse).each(function () {
                    $(this).removeClass(classToUse);
                });
                $target.addClass(classToUse);
                var currLevel = $target.parent().attr("level")
                var currActiveFilter = this.findActiveFilterByField(fieldId, controlType);
                var prefix = ""
                if (currLevel >= 2)
                {
                	var lev1Selection = $fieldSet.find('div.data-control-id button.' + classToUse); 
                	prefix = lev1Selection.attr('val').valueOf() + currActiveFilter.separator;
                }
    			if (currLevel == 3)
				{
                	var lev2Selection = $fieldSet.find('div.level2 button.' + classToUse); 
                	prefix += lev2Selection.attr('val').valueOf() + currActiveFilter.separator;
				}
                var listaValori = [];
                if ($target.attr('val') && $target.attr('val').length)
                	listaValori.push(prefix + $target.attr('val').valueOf());
                else if (prefix.length)
                	listaValori.push(prefix.substring(0, prefix.length-1))
                	
                currActiveFilter.userChanged = true;

                if (listaValori.length == 1 && listaValori[0] == "All" && !currActiveFilter.noAllButton) {
                    listaValori = [];
                    currActiveFilter.term = "";
                    currActiveFilter.showLevel2 = "none";
                    currActiveFilter.showLevel3 = "none";
                }
                else
            	{
                	// check if leaf or if it has sublevels
                	var currSelectedValue = $target.attr('val').valueOf();
                	var currActiveFilterValue = null;
                	if (currLevel == 1)
                		currActiveFilterValue = _.find(currActiveFilter.values, function (currVal) {return currVal.value == currSelectedValue})
                	else if (currLevel == 2)
                		currActiveFilterValue = _.find(currActiveFilter.valuesLev2, function (currVal) {return currVal.value == currSelectedValue})
                	else if (currLevel == 3)
                		currActiveFilterValue = _.find(currActiveFilter.valuesLev3, function (currVal) {return currVal.value == currSelectedValue})
                		
                	if (currActiveFilterValue && currActiveFilterValue.record)
            		{
                    	currActiveFilter.term = prefix + currSelectedValue;
                    	if (currLevel == 1)
                		{
                    		var divLev2 = $fieldSet.find('div.level2') 
                    		if (divLev2.length > 0)
                			{
                    			divLev2[0].style.display="none"
                        		var divLev3 = $fieldSet.find('div.level3') 
                        		if (divLev3.length)
                        			divLev3[0].style.display="none"
                			}
                		}
                    	else if (currLevel == 2)
                		{
                    		var divLev3 = $fieldSet.find('div.level3') 
                    		if (divLev3.length > 0)
                    			divLev3[0].style.display="none"
                		}
                    	// must also send currSelectedValue to all models!!!!
                        this.doAction("onButtonsetClicked", fieldId, listaValori, "add", currActiveFilter);
            		}
                	else
            		{
                		currActiveFilter.term = prefix + currSelectedValue;
                		if (currActiveFilter.term.length && currActiveFilter.term[currActiveFilter.term.length-1] == currActiveFilter.separator)
                			currActiveFilter.term = currActiveFilter.term.substring(0, currActiveFilter.term.length-1)
                			
                		// redraw the filter!!!
	                    var flt;
	                    if (currActiveFilter.ctrlId)
	                    	flt = self.el.find("#"+currActiveFilter.ctrlId);
	                    else flt = this.el.find("div.filter");
	                    
	            		var currFilterCtrl = $(flt).find(".data-control-id");
	            		this.updateHierarchicRadiobuttons($(flt), currActiveFilter, $(currFilterCtrl));                		
                		
                		listaValori = [];
                		// THEN send a list of all values compatible with the choice. Eg: if user selected ANDROID
                		// which has sublevels TABLET & SMARTPHONE, both ANDROID.TABLET and ANDROID.SMARTPHONE must be sent
                    	_.each(this._sourceDataset.getRecords(), function(record) {
                            var field = self._sourceDataset.fields.get(currActiveFilter.field);
                            var currV = record.getFieldValue(field);
                            var searchString = prefix + currSelectedValue+currActiveFilter.separator;
                            if (currSelectedValue == "")
                            	searchString = prefix;
                            
                            if (currV.indexOf(searchString) == 0)
                            	listaValori.push(currV)
                    	});
                    	// must also send currSelectedValue to all models!!!!
                		this.doAction("onButtonsetClicked", fieldId, listaValori, "add", currActiveFilter);
            		}
                	
            	}
        	}
            else
        	{
                var $fieldSet = $target.parent().parent();
                var type = $fieldSet.attr('data-filter-type');
                var fieldId = $fieldSet.attr('data-filter-field');
                var controlType = $fieldSet.attr('data-control-type');
                var classToUse = "btn-info"
                var currActiveFilter = this.findActiveFilterByField(fieldId, controlType);
                if (controlType == "multibutton") {
                	$target.toggleClass(classToUse);
                	if (currActiveFilter.nullSelectionNotAllowed)
            		{
                		if ($fieldSet.find('div.btn-group button.' + classToUse).length == 0)
            			{
                			// too few selections
                			// re-select the button then exit 
                        	$target.toggleClass(classToUse);
                			return;
            			}
            		}                
                }
                else if (controlType == "radiobuttons") {
                    // ensure one and only one selection is performed
                    classToUse = "btn-primary"
                    $fieldSet.find('div.btn-group button.' + classToUse).each(function () {
                        $(this).removeClass(classToUse);
                    });
                    $target.addClass(classToUse);
                }
                var listaValori = [];
                $fieldSet.find('div.btn-group button.' + classToUse).each(function () {
                    listaValori.push($(this).attr('val').valueOf()); // in case there's a date, convert it with valueOf
                });
                currActiveFilter.userChanged = true;
                if (controlType == "multibutton")
                    currActiveFilter.list = listaValori;
                else if (controlType == "radiobuttons") {
                    if (listaValori.length == 1 && listaValori[0] == "All" && !currActiveFilter.noAllButton) {
                        listaValori = [];
                        currActiveFilter.term = "";
                    }
                    else currActiveFilter.term = $target.attr('val').valueOf();
                }
                this.doAction("onButtonsetClicked", fieldId, listaValori, "add", currActiveFilter);
        	}
        },
        onLegendItemClicked:function (e) {
            e.preventDefault();
            var $target = $(e.currentTarget);
            var $fieldSet = $target.parent().parent().parent().parent().parent();
            var type = $fieldSet.attr('data-filter-type');
            var fieldId = $fieldSet.attr('data-filter-field');
            var controlType = $fieldSet.attr('data-control-type');

            $target.toggleClass("not-selected");
            var listaValori = [];
            $fieldSet.find('div.legend-item').each(function () {
                if (!$(this).hasClass("not-selected"))
                    listaValori.push($(this).attr("myValue").valueOf()); // in case there's a date, convert it with valueOf
            });

            // make sure at least one value is selected
            if (listaValori.length > 0) {
                var currActiveFilter = this.findActiveFilterByField(fieldId, controlType)
                currActiveFilter.userChanged = true;
                currActiveFilter.legend = listaValori;

                this.doAction("onLegendItemClicked", fieldId, listaValori, "add", currActiveFilter);
            }
            else $target.toggleClass("not-selected"); // reselect the item and exit
        },
        onListItemClicked:function (e) {
            e.preventDefault();
            // let's check if user clicked on combobox or table and behave consequently
            var $target = $(e.currentTarget);
            var $table;
            var $targetTD;
            var $targetOption;
            var $combo;
            if ($target.is('td')) {
                $targetTD = $target;
                $table = $target.parent().parent().parent();
                var type = $table.attr('data-filter-type');
                if (type == "range")
                    $combo = $table.parent().parent().find(".drop-down2");
            }
            else if ($target.is('select')) {
                $combo = $target;
                $table = $combo.parent().find(".table");
            }
            this.handleListItemClicked($targetTD, $table, $combo, e.ctrlKey);
        },
        handleListItemClicked:function ($targetTD, $table, $combo, ctrlKey) {
            var fieldId = $table.attr('data-filter-field');
            var controlType = $table.attr('data-control-type');
            var type = $table.attr('data-filter-type');
            if (type == "range" && typeof $targetTD == "undefined") {
                // case month_week_calendar
                // user clicked on year combo
                var year = parseInt($combo.val());
                // update year value in filter (so that the value is retained after re-rendering)
                this.findActiveFilterByField(fieldId, controlType).year = year;
                this.render();
            }
            if (typeof $targetTD != "undefined") {
                // user clicked on table
                if (!ctrlKey) {
                    $table.find('tr').each(function () {
                        $(this).removeClass(this._selectedClassName);
                    });
                }
                $targetTD.parent().addClass(this._selectedClassName);
                var listaValori = [];
                if (type == "list") {
                    $table.find('tr.' + this._selectedClassName + " td").each(function () {
                        listaValori.push($(this).text());
                    });
                }

                var currFilter = this.findActiveFilterByField(fieldId, controlType);
                currFilter.userChanged = true;

                if (type == "range") {
                    // case month_week_calendar
                    var year = parseInt($combo.val());
                    var startDate = $targetTD.attr('startDate');
                    var endDate = $targetTD.attr('stopDate');

                    currFilter.term = $targetTD.attr('myValue'); // save selected item for re-rendering later

                    this.doAction("onListItemClicked", fieldId, [startDate, endDate], "add", currFilter);
                }
                else if (type == "list") {
                    this.doAction("onListItemClicked", fieldId, listaValori, "add", currFilter);
                }
                else if (type == "term") {
                    this.doAction("onListItemClicked", fieldId, [$targetTD.text()], "add", currFilter);
                }
            }
        },

        // action could be add or remove
        doAction:function (eventType, fieldName, values, actionType, currFilter) {
            var self=this;

            var res = [];
            // make sure you use all values, even 2nd or 3rd level if present (hierarchic radiobuttons only)
            var allValues = currFilter.values
            if (currFilter.valuesLev3)
            	allValues = currFilter.values.concat(currFilter.valuesLev2, currFilter.valuesLev3)
            else if (currFilter.valuesLev2)
            	allValues = currFilter.values.concat(currFilter.valuesLev2)
            	
            // TODO it is not efficient, record must be indexed by term
            // TODO conversion to string is not correct, original value must be used
            _.each(allValues, function(v) {
              if(v.record) {
                  var field = v.record.fields.get(currFilter.field);
                  if(_.contains(values,v.record.getFieldValueUnrendered(field).toString()))
                    res.push(v.record);
              };
            });
            var actions = this.options.actions;
            if(res.length>0) {
            	// I'm using record (not facet) so I can pass it to actions
                actions.forEach(function(currAction){
                    currAction.action.doAction(res, currAction.mapping);
                });
            } else
            {
                actions.forEach(function(currAction){
                    currAction.action.doActionWithFacets(currFilter.facet.attributes.terms, values, currAction.mapping, fieldName);
                });                
            }
        },

        dateConvert:function (d) {
            var dd = new Date(d);
            return dd.toDateString();
        },

        dateConvertBack:function (d) {
            // convert 01/31/2012  to 2012-01-31 00:00:00
            try {
                var p = d.split(/\D/);
                return p[2] + "-" + p[0] + "-" + p[1] + " 00:00:00";
            }
            catch (ex) {
                return d;
            }
        },

        onStyledSliderValueChanged:function (e, value) {
            e.preventDefault();
            var $target = $(e.target).parent().parent();
            var fieldId = $target.attr('data-filter-field');
            var fieldType = $target.attr('data-filter-type');
            var controlType = $target.attr('data-control-type');
            if (fieldType == "term") {
                var term = value;
                var activeFilter = this.findActiveFilterByField(fieldId, controlType);
                activeFilter.userChanged = true;
                activeFilter.term = term;
                activeFilter.list = [term];
                this.doAction("onStyledSliderValueChanged", fieldId, [term], "add", activeFilter);
            }
            else if (fieldType == "range") {
                var activeFilter = this.findActiveFilterByField(fieldId, controlType);
                activeFilter.userChanged = true;
                var fromTo = value.split(";");
                var from = fromTo[0];
                var to = fromTo[1];
                activeFilter.from = from;
                activeFilter.to = to;
                this.doAction("onStyledSliderValueChanged", fieldId, [from, to], "add", activeFilter);
            }
        },
        onFilterValueChanged:function (e) {
            e.preventDefault();
            var $target = $(e.target).parent();
            var fieldId = $target.attr('data-filter-field');
            var fieldType = $target.attr('data-filter-type');
            var controlType = $target.attr('data-control-type');

            var activeFilter = this.findActiveFilterByField(fieldId, controlType);
            activeFilter.userChanged = true;
            if (fieldType == "term") {
                var term;
                var termObj = $target.find('.data-control-id');
                switch (controlType) {
                    case "term":
                        term = termObj.val();
                        break;
                    case "slider":
                        term = termObj.slider("value");
                        break;
                    case "slider_styled":
                        term = termObj.attr("value");
                        if (term = "")
                        	term = null;
                        break;
                    case "dropdown":
                    case "dropdown_styled":
                        term = termObj.val();
                        break;
                    case "listbox":
                        term = termObj.val();
                        break;
                }
                activeFilter.term = term;
                if (term)
                	activeFilter.list = [term];
                else activeFilter.list = [];
                
                this.doAction("onFilterValueChanged", fieldId, activeFilter.list, "add", activeFilter);
            }
            else if (fieldType == "list") {
                var list = new Array();
                var listObj = $target.find('.data-control-id')[0]; //return a plain HTML select obj
                for (var i in listObj.options)
                    if (listObj.options[i].selected)
                        list.push(listObj.options[i].value);

                activeFilter.list = list;
                this.doAction("onFilterValueChanged", fieldId, list, "add", activeFilter);
            }
            else if (fieldType == "range") {
                var from;
                var to;
                var fromTo;
                var fromObj = $target.find('.data-control-id-from');
                var toObj = $target.find('.data-control-id-to');
                var fromToObj = $target.find('.data-control-id');
                switch (controlType) {
                    case "range":
                        from = fromObj.val();
                        to = toObj.val();
                        break;
                    case "range_slider":
                        from = fromToObj.slider("values", 0);
                        to = fromToObj.slider("values", 1);
                        break;
                    case "range_slider_styled":
                        fromTo = fromToObj.attr("value").split(";");
                        from = fromTo[0];
                        to = fromTo[1];
                        break;
                    case "range_calendar":
                        from = new Date(fromObj.val());
                        to = new Date(toObj.val());
                        break;
                    case "dropdown_date_range":
                        from = fromToObj.find(":selected").attr("startDate");
                        to = fromToObj.find(":selected").attr("stopDate");
                        activeFilter.term = fromToObj.val();
                        break;
                }
                activeFilter.from = from;
                activeFilter.to = to;
                this.doAction("onFilterValueChanged", fieldId, [from, to], "add",activeFilter);
            }
        },
        onAddFilterShow:function (e) {
            e.preventDefault();
            var $target = $(e.target);
            $target.hide();
            this.el.find('div.js-add').show();
        },
        hidePanel:function (obj) {
            $(function () {
                obj.hide("blind", {}, 1000, function () {
                });
            });
        },
        getFilterTypeFromControlType:function (controlType) {
            switch (controlType) {
                case "dropdown" :
                case "dropdown_styled" :
                case "slider" :
                case "slider_styled" :
                case "radiobuttons" :
                    return "term";
                case "range_slider" :
                case "range_slider_styled" :
                case "range_calendar" :
                case "month_week_calendar" :
                case "dropdown_date_range" :
                    return "range";
                case "list" :
                case "listbox":
                case "listbox_styled":
                case "legend" :
                case "multibutton" :
                case "hierarchic_radiobuttons" :
                    return "list";
            }
            return controlType;
        },
        getFieldType:function (field) {
            var fieldFound = this._sourceDataset.fields.find(function (e) {
                return e.get('id') === field
            })
            if (typeof fieldFound != "undefined" && fieldFound != null)
                return fieldFound.get('type');

            return "string";
        },
        onAddFilter:function (e) {
            e.preventDefault();
            var $target = $(e.target).parent().parent();
            $target.hide();
            var controlType = $target.find('select.filterType').val();
            var filterType = this.getFilterTypeFromControlType(controlType);
            var field = $target.find('select.fields').val();
            this.addNewFilterControl({type:filterType, field:field, controlType:controlType});
        },
        addNewFilterControl:function (newFilter) {
            if (typeof newFilter.type == 'undefined')
                newFilter.type = this.getFilterTypeFromControlType(newFilter.controlType)

            if (typeof newFilter.fieldType == 'undefined')
                newFilter.fieldType = this.getFieldType(newFilter.field)

            if (newFilter.controlType == "radiobuttons")
        	{
            	if (newFilter.noAllButton && newFilter.noAllButton == true)
            		newFilter.useAllButton = false 
            	else newFilter.useAllButton = true
        	}
            if (newFilter.controlType == "radiobuttons" || newFilter.controlType == "multibutton")
            	newFilter.useShapeOnly = (newFilter.useShapeOnly && newFilter.useShapeOnly == true)

            if (newFilter.controlType == "month_week_calendar") {
                if (typeof newFilter.period == "undefined")
                    newFilter.period = "Months"

                if (typeof newFilter.year == "undefined")
                    newFilter.year = new Date().getFullYear();
            }
            this.activeFilters.push(newFilter);

        },
        onPeriodChanged:function (e) {
            e.preventDefault();
            var $table = $(e.target).parent().find(".table");
            //var $yearCombo = $(e.target).parent().find(".drop-down2");
            var fieldId = $table.attr('data-filter-field');
            var controlType = $table.attr('data-control-type');

            var type = $table.attr('data-filter-type');
            var currFilter = this.findActiveFilterByField(fieldId, controlType);
            currFilter.period = $(e.target).val();
            currFilter.term = null;
            this.render();
        },
        findActiveFilterByField:function (fieldId, controlType) {
            for (var j in this.activeFilters) {
                if (this.activeFilters[j].field == fieldId && this.activeFilters[j].controlType == controlType)
                    return this.activeFilters[j];
            }
            return new Object(); // to avoid "undefined" errors
        },
        onRemoveFilter:function (e) {
            e.preventDefault();
            var $target = $(e.target);
            var field = $target.parent().parent().attr('data-filter-field');
            var controlType = $target.parent().parent().attr('data-control-type');
            var currFilter = this.findActiveFilterByField(field, controlType);
            currFilter.term = undefined;
            currFilter.value = [];
            currFilter.userChanged = undefined;

            if (currFilter.controlType == "list" || currFilter.controlType == "month_week_calendar") {
                $table = $target.parent().parent().find(".table")
                if (typeof $table != "undefined") {
                    $table.find('tr').each(function () {
                        $(this).removeClass(this._selectedClassName);
                    });
                }
            }
            else if (currFilter.controlType == "slider_styled") {
                var filterCtrl = $target.parent().parent().find(".slider-styled")
                filterCtrl.jslider("value", filterCtrl.jslider().settings.from);
            }

            this.doAction("onRemoveFilter", field, [], "remove", currFilter);

        },

        composeStateData:function () {
            var self = this;
            var queryString = '?';
            var items = [];
            $.each(self._sourceDataset.queryState.toJSON(), function (key, value) {
                if (typeof(value) === 'object') {
                    value = JSON.stringify(value);
                }
                items.push(key + '=' + encodeURIComponent(value));
            });

            return items;
        },


    });

})(jQuery, recline.View);
/*jshint multistr:true */

this.recline = this.recline || {};
this.recline.View = this.recline.View || {};

(function ($, my) {


    my.VisualSearch = Backbone.View.extend({

        template:'<div id="search_box_container" id="{{uid}}"> </div><div id="search_query">&nbsp;</div>',

        initialize:function (options) {
            var self = this;

            this.el = $(this.el);
            _.bindAll(this, 'render', 'redraw');

            this.uid = options.id || ("d3_" + new Date().getTime() + Math.floor(Math.random() * 10000)); // generating an unique id for the chart

            /*
            this.model.bind('change', self.render);
            this.model.fields.bind('reset', self.render);
            this.model.fields.bind('add', self.render);
            this.model.records.bind('add', self.redraw);
            this.model.records.bind('reset', self.redraw);
            */


        },

        render:function () {
            var self = this;

            var out = Mustache.render(this.template, this);
            this.el.html(out);

            return this;
        },

        redraw:function () {
            var self = this;

            console.log($().jquery);
            console.log($.ui.version);

            window.visualSearch = VS.init({
                container  : $('#search_box_container'),
                query      : 'country: "South Africa" account: 5-samuel "U.S. State": California',
                showFacets : true,
                unquotable : [
                    'text',
                    'account',
                    'filter',
                    'access'
                ],
                callbacks  : {
                    search : function(query, searchCollection) {
                        var $query = $('#search_query');
                        $query.stop().animate({opacity : 1}, {duration: 300, queue: false});
                        $query.html('<span class="raquo">&raquo;</span> You searched for: <b>' + searchCollection.serialize() + '</b>');
                        clearTimeout(window.queryHideDelay);
                        window.queryHideDelay = setTimeout(function() {
                            $query.animate({
                                opacity : 0
                            }, {
                                duration: 1000,
                                queue: false
                            });
                        }, 2000);
                    },
                    valueMatches : function(category, searchTerm, callback) {
                        switch (category) {
                            case 'account':
                                callback([
                                    { value: '1-amanda', label: 'Amanda' },
                                    { value: '2-aron',   label: 'Aron' },
                                    { value: '3-eric',   label: 'Eric' },
                                    { value: '4-jeremy', label: 'Jeremy' },
                                    { value: '5-samuel', label: 'Samuel' },
                                    { value: '6-scott',  label: 'Scott' }
                                ]);
                                break;
                            case 'filter':
                                callback(['published', 'unpublished', 'draft']);
                                break;
                            case 'access':
                                callback(['public', 'private', 'protected']);
                                break;
                            case 'title':
                                callback([
                                    'Pentagon Papers',
                                    'CoffeeScript Manual',
                                    'Laboratory for Object Oriented Thinking',
                                    'A Repository Grows in Brooklyn'
                                ]);
                                break;
                            case 'city':
                                callback([
                                    'Cleveland',
                                    'New York City',
                                    'Brooklyn',
                                    'Manhattan',
                                    'Queens',
                                    'The Bronx',
                                    'Staten Island',
                                    'San Francisco',
                                    'Los Angeles',
                                    'Seattle',
                                    'London',
                                    'Portland',
                                    'Chicago',
                                    'Boston'
                                ])
                                break;
                            case 'U.S. State':
                                callback([
                                    "Alabama", "Alaska", "Arizona", "Arkansas", "California",
                                    "Colorado", "Connecticut", "Delaware", "District of Columbia", "Florida",
                                    "Georgia", "Guam", "Hawaii", "Idaho", "Illinois",
                                    "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana",
                                    "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
                                    "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
                                    "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina",
                                    "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania",
                                    "Puerto Rico", "Rhode Island", "South Carolina", "South Dakota", "Tennessee",
                                    "Texas", "Utah", "Vermont", "Virginia", "Virgin Islands",
                                    "Washington", "West Virginia", "Wisconsin", "Wyoming"
                                ]);
                                break
                            case 'country':
                                callback([
                                    "China", "India", "United States", "Indonesia", "Brazil",
                                    "Pakistan", "Bangladesh", "Nigeria", "Russia", "Japan",
                                    "Mexico", "Philippines", "Vietnam", "Ethiopia", "Egypt",
                                    "Germany", "Turkey", "Iran", "Thailand", "D. R. of Congo",
                                    "France", "United Kingdom", "Italy", "Myanmar", "South Africa",
                                    "South Korea", "Colombia", "Ukraine", "Spain", "Tanzania",
                                    "Sudan", "Kenya", "Argentina", "Poland", "Algeria",
                                    "Canada", "Uganda", "Morocco", "Iraq", "Nepal",
                                    "Peru", "Afghanistan", "Venezuela", "Malaysia", "Uzbekistan",
                                    "Saudi Arabia", "Ghana", "Yemen", "North Korea", "Mozambique",
                                    "Taiwan", "Syria", "Ivory Coast", "Australia", "Romania",
                                    "Sri Lanka", "Madagascar", "Cameroon", "Angola", "Chile",
                                    "Netherlands", "Burkina Faso", "Niger", "Kazakhstan", "Malawi",
                                    "Cambodia", "Guatemala", "Ecuador", "Mali", "Zambia",
                                    "Senegal", "Zimbabwe", "Chad", "Cuba", "Greece",
                                    "Portugal", "Belgium", "Czech Republic", "Tunisia", "Guinea",
                                    "Rwanda", "Dominican Republic", "Haiti", "Bolivia", "Hungary",
                                    "Belarus", "Somalia", "Sweden", "Benin", "Azerbaijan",
                                    "Burundi", "Austria", "Honduras", "Switzerland", "Bulgaria",
                                    "Serbia", "Israel", "Tajikistan", "Hong Kong", "Papua New Guinea",
                                    "Togo", "Libya", "Jordan", "Paraguay", "Laos",
                                    "El Salvador", "Sierra Leone", "Nicaragua", "Kyrgyzstan", "Denmark",
                                    "Slovakia", "Finland", "Eritrea", "Turkmenistan"
                                ], {preserveOrder: true});
                                break;
                        }
                    },
                    facetMatches : function(callback) {
                        callback([
                            'account', 'filter', 'access', 'title',
                            { label: 'city',    category: 'location' },
                            { label: 'address', category: 'location' },
                            { label: 'country', category: 'location' },
                            { label: 'U.S. State', category: 'location' }
                        ]);
                    }
                }
            });

        },



        doActions:function (actions, records) {

            _.each(actions, function (d) {
                d.action.doAction(records, d.mapping);
            });

        },

        getActionsForEvent:function (eventType) {
            var self = this;
            var actions = [];

            _.each(self.options.actions, function (d) {
                if (_.contains(d.event, eventType))
                    actions.push(d);
            });

            return actions;
        }


    });


})(jQuery, recline.View);

this.recline = this.recline || {};
this.recline.View = this.recline.View || {};

(function ($, view) {

    "use strict";

    view.D3Bullet = Backbone.View.extend({
        template: '<div id="{{uid}}" style="width: {{width}}px; height: {{height}}px;"> <div> ',
        firstResizeDone: false,
        initialize:function (options) {

            this.el = $(this.el);
            _.bindAll(this, 'render', 'redraw', 'resize');

            this.model.bind('change', this.render);
            this.model.fields.bind('reset', this.render);
            this.model.fields.bind('add', this.render);

            this.model.bind('query:done', this.redraw);
            this.model.queryState.bind('selection:done', this.redraw);

        	$(window).resize(this.resize);
            this.uid = options.id || ("d3_" + new Date().getTime() + Math.floor(Math.random() * 10000)); // generating an unique id for the chart
            if (options.width)
            	this.width = options.width;
            else this.width = "100"
            if (options.height)
            	this.height = options.height;
            else this.height = "100"
            	
            if (!this.options.animation) {
                this.options.animation = {
                    duration:2000,
                    delay:200
                }
            }

            //render header & svg container
            var out = Mustache.render(this.template, this);
            this.el.html(out);
        },

        resize:function () {
        	this.firstResizeDone = true;
        	var currH = $("#"+this.uid).height()
        	var currW = $("#"+this.uid).width()
        	var $parent = this.el
        	var newH = $parent.height()
        	var newW = $parent.width()
        	if (typeof this.options.width == "undefined")
    		{
            	$("#"+this.uid).width(newW)
            	this.width = newW
    		}
        	if (typeof this.options.height == "undefined")
    		{
	        	$("#"+this.uid).height(newH)
	        	this.height = newH
    		}
        	this.redraw();
        },

        render:function () {
            var self = this;
            var graphid = "#" + this.uid;

            if (self.graph)
                jQuery(graphid).empty();

            self.graph = d3.select(graphid);
            
            if (!self.firstResizeDone)
            	self.resize();
        },

        redraw:function () {
                var self = this;
            var field = this.model.fields.get(this.options.fieldRanges);
            var fieldMeasure = this.model.fields.get(this.options.fieldMeasures);

            var type;
            if(this.options.resultType) {
                type = this.options.resultType;
            }

            var records = _.map(this.options.model.getRecords(type), function (record) {
                var ranges = [];
                _.each(self.options.fieldRanges, function (f) {
                    var field = self.model.fields.get(f);
                    ranges.push(record.getFieldValueUnrendered(field));
                });
                var measures = [];
                _.each(self.options.fieldMeasures, function (f) {
                    var field = self.model.fields.get(f);
                    measures.push(record.getFieldValueUnrendered(field));
                });
                var markers = [];
                _.each(self.options.fieldMarkers, function (f) {
                    var field = self.model.fields.get(f);
                    markers.push(record.getFieldValueUnrendered(field));
                });
                return {ranges:ranges, measures:measures, markers: markers, customTicks: self.options.customTicks};
            });

            var margin = {top: 5, right: 40, bottom: 40, left: 40};
            var width = self.width - margin.left - margin.right;
            var height = self.height - margin.top - margin.bottom;
            if (width < 0)
            	width = 0;

            if (height < 0)
            	height = 0;

            self.plugin();

            this.chart = d3.bullet()
                .width(width)
                .height(height);

            this.drawD3(records, width, height, margin);
       },

        drawD3:function (data, width, height, margin) {
            var self = this;

            self.graph
                .selectAll(".bullet")
                .remove();

            self.graph.selectAll(".bullet")
                .data(data)
                .enter().append("svg")
                .attr("class", "bullet")
                .attr("width", width + margin.left + margin.right)
                .attr("height", height + margin.top + margin.bottom)
                .append("g")
                .attr("transform", "translate(" + margin.left + "," + margin.top + ")")
                .call(self.chart);

            self.alreadyDrawed = true

            /*var title = svg.append("g")
             .style("text-anchor", "end")
             .attr("transform", "translate(-6," + height / 2 + ")");

             title.append("text")
             .attr("class", "title")
             .text(function(d) { return d.title; });

             title.append("text")
             .attr("class", "subtitle")
             .attr("dy", "1em")
             .text(function(d) { return d.subtitle; });
              */
        },
        plugin:function () {
            d3.bullet = function () {
                var orient = "left", // TODO top & bottom
                    reverse = false,
                    duration = 0,
                    ranges = bulletRanges,
                    markers = bulletMarkers,
                    measures = bulletMeasures,
                    width = 380,
                    height = 30,
                    tickFormat = null,
                	customTicks = bulletCustomTicks;

                // For each small multiple…
                function bullet(g) {
                    g.each(function (d, i) {
                        var rangez = ranges.call(this, d, i).slice().sort(d3.descending),
                            markerz = markers.call(this, d, i).slice().sort(d3.descending),
                            measurez = measures.call(this, d, i).slice().sort(d3.descending),
                            customTickz = customTicks.call(this, d, i),
                            g = d3.select(this);

                        // Compute the new x-scale.
                        var x1 = d3.scale.linear()
                            .domain([0, Math.max(rangez[0], markerz[0], measurez[0])])
                            .range(reverse ? [width, 0] : [0, width]);

                        // Retrieve the old x-scale, if this is an update.
                        var x0 = this.__chart__ || d3.scale.linear()
                            .domain([0, Infinity])
                            .range(x1.range());

                        // Stash the new scale.
                        this.__chart__ = x1;

                        // Derive width-scales from the x-scales.
                        var w0 = bulletWidth(x0),
                            w1 = bulletWidth(x1);

                        // Update the range rects.
                        var range = g.selectAll("rect.range")
                            .data(rangez);

                        range.enter().append("rect")
                            .attr("class", function (d, i) {
                                return "range s" + i;
                            })
                            .attr("width", w0)
                            .attr("height", height)
                            .attr("x", reverse ? x0 : 0)
                            .transition()
                            .duration(duration)
                            .attr("width", w1)
                            .attr("x", reverse ? x1 : 0);

                        range.transition()
                            .duration(duration)
                            .attr("x", reverse ? x1 : 0)
                            .attr("width", w1)
                            .attr("height", height);

                        // Update the measure rects.
                        var measure = g.selectAll("rect.measure")
                            .data(measurez);

                        measure.enter().append("rect")
                            .attr("class", function (d, i) {
                                return "measure s" + i;
                            })
                            .attr("width", w0)
                            .attr("height", function (d, i) { return height / (i*4+3); })
                            .attr("x", reverse ? x0 : 0)
                            .attr("y", function (d, i) { return (height / 3.0 - height / (i*4+3.0)) /2.0 + height / 3.0; })
                            .transition()
                            .duration(duration)
                            .attr("width", w1)
                            .attr("x", reverse ? x1 : 0);

                        measure.transition()
                            .duration(duration)
                            .attr("width", w1)
                            .attr("height", function (d, i) { return height / (i*4+3); })
                            .attr("x", reverse ? x1 : 0)
                            .attr("y", function (d, i) { return (height / 3.0 - height / (i*4+3.0)) /2.0 + height / 3.0; });

                        // Update the marker lines.
                        var marker = g.selectAll("line.marker")
                            .data(markerz);

                        marker.enter().append("line")
                            .attr("class", "marker")
                            .attr("x1", x0)
                            .attr("x2", x0)
                            .attr("y1", height / 6)
                            .attr("y2", height * 5 / 6)
                            .transition()
                            .duration(duration)
                            .attr("x1", x1)
                            .attr("x2", x1);

                        marker.transition()
                            .duration(duration)
                            .attr("x1", x1)
                            .attr("x2", x1)
                            .attr("y1", height / 6)
                            .attr("y2", height * 5 / 6);

                        // Compute the tick format.
                        var format = tickFormat || x1.tickFormat(8);

                        // Update the tick groups.
                        var tick = g.selectAll("g.tick")
                            .data(x1.ticks(8), function (d) {
                                return this.textContent || format(d);
                            });
                        
                        // Initialize the ticks with the old scale, x0.
                        var tickEnter = tick.enter().append("g")
                            .attr("class", "tick")
                            .attr("transform", bulletTranslate(x0))
                            .style("opacity", 1e-6);

                        var idx = -1;
                        var customFormat = function() {
                        	if (customTickz && customTickz[++idx])
                        		return customTickz[idx];
                        	else return ""
                        }

                        tickEnter.append("line")
                            .attr("y1", height)
                            .attr("y2", height * 7 / 6);

                        tickEnter.append("text")
                            .attr("text-anchor", "middle")
                            .attr("dy", "1em")
                            .attr("y", height * 7 / 6)
                            .text((customTickz ? customFormat: format));

                        // Transition the entering ticks to the new scale, x1.
                        tickEnter.transition()
                            .duration(duration)
                            .attr("transform", bulletTranslate(x1))
                            .style("opacity", 1);

                        // Transition the updating ticks to the new scale, x1.
                        var tickUpdate = tick.transition()
                            .duration(duration)
                            .attr("transform", bulletTranslate(x1))
                            .style("opacity", 1);

                        tickUpdate.select("line")
                            .attr("y1", height)
                            .attr("y2", height * 7 / 6);

                        tickUpdate.select("text")
                            .attr("y", height * 7 / 6);

                        // Transition the exiting ticks to the new scale, x1.
                        tick.exit().transition()
                            .duration(duration)
                            .attr("transform", bulletTranslate(x1))
                            .style("opacity", 1e-6)
                            .remove();
                    });
                    d3.timer.flush();
                }

                // left, right, top, bottom
                bullet.orient = function (x) {
                    if (!arguments.length) return orient;
                    orient = x;
                    reverse = orient == "right" || orient == "bottom";
                    return bullet;
                };

                // ranges (bad, satisfactory, good)
                bullet.ranges = function (x) {
                    if (!arguments.length) return ranges;
                    ranges = x;
                    return bullet;
                };

                // markers (previous, goal)
                bullet.markers = function (x) {
                    if (!arguments.length) return markers;
                    markers = x;
                    return bullet;
                };

                // measures (actual, forecast)
                bullet.measures = function (x) {
                    if (!arguments.length) return measures;
                    measures = x;
                    return bullet;
                };

                bullet.width = function (x) {
                    if (!arguments.length) return width;
                    width = x;
                    return bullet;
                };

                bullet.height = function (x) {
                    if (!arguments.length) return height;
                    height = x;
                    return bullet;
                };

                bullet.tickFormat = function (x) {
                    if (!arguments.length) return tickFormat;
                    tickFormat = x;
                    return bullet;
                };

                bullet.customTicks = function (x) {
                    if (!arguments.length) return customTicks;
                    customTicks = x;
                    return bullet;
                };

                bullet.duration = function (x) {
                    if (!arguments.length) return duration;
                    duration = x;
                    return bullet;
                };

                
                return bullet;
            };

            function bulletCustomTicks(d) {
                return d.customTicks;
            }

            function bulletRanges(d) {
                return d.ranges;
            }

            function bulletMarkers(d) {
                return d.markers;
            }

            function bulletMeasures(d) {
                return d.measures;
            }

            function bulletTranslate(x) {
                return function (d) {
                    return "translate(" + x(d) + ",0)";
                };
            }

            function bulletWidth(x) {
                var x0 = x(0);
                return function (d) {
                    return Math.abs(x(d) - x0);
                };
            }
        }




    });


})(jQuery, recline.View);/*jshint multistr:true */

this.recline = this.recline || {};
this.recline.View = this.recline.View || {};

(function ($, my) {


    my.D3ChoroplethMap = Backbone.View.extend({
    	rendered: false,
        initialize:function (options) {
            var self = this;

            _.bindAll(this, 'render', 'redraw', 'getRecordByValue', 'getActionsForEvent');

            this.model.bind('change', self.render);
            this.model.fields.bind('reset', self.render);
            this.model.fields.bind('add', self.render);

            this.model.bind('query:done', this.redraw);
            this.model.queryState.bind('selection:done', this.redraw);

            this.uid = "" + new Date().getTime() + Math.floor(Math.random() * 10000); // generating an unique id for the map
            this.el = options.el;

            this.mapWidth = options.state.width // optional. May be undefined
            this.mapHeight = options.state.height // optional. May be undefined

            this.unselectedColor = "#C0C0C0";
            if (this.options.state.unselectedColor)
                this.unselectedColor = this.options.state.unselectedColor;

            this.svg = d3v3.select(this.el).append("svg").attr("x","0").attr("y","0").attr("xmlns","http://www.w3.org/2000/svg").attr("version","1.1")

            if (this.mapWidth == null || typeof this.mapWidth == "undefined")
            	this.mapWidth = $(this.el).width()
            	
            if (this.mapHeight == null || typeof this.mapHeight == "undefined")
            	this.mapHeight = $(this.el).height()

           	this.svg.attr("width", this.mapWidth)
            this.svg.attr("height", this.mapHeight)
        },

        render:function () {
            var self = this;

            var mapJson = this.options.state["mapJson"];
            var layer = this.options.state["layer"];
            var showRegionNames = this.options.state["showRegionNames"]
            var showCities = this.options.state["showCities"]
            var randomColors = this.options.state["randomColors"]
            
            var rotation = self.options.state["rotation"]
            if (rotation == null || rotation == "undefined")
            	rotation = [0,0]
            
            var clickFunction = function() {
        		$(self.el+" svg path.region").each( function() {
        			$(this).attr("class", $(this).attr("class").replace(" selected", ""))
        		});
        		$(this).attr("class", $(this).attr("class")+" selected")
        		
        		d3v3.event.preventDefault();
        	}
            var hoverFunction = function() {/*console.log("HOVERING "+this.attributes.regionName.nodeValue)*/}
            
            // find all fields of this layer
            //  mapping: [{srcShapeField: "state", srcValueField: "value", destAttribute: "name", destLayer: "usa"}],
            var fields = _.filter(this.options.state["mapping"], function(m) {
                return m.destLayer == layer;
            });

            if(fields.length > 1)
                throw "view.D3.ChoroplethMap.js: more than one field associated with layer, impossible to link with actions"

            if(fields.length == 1)
        	{
                // find all actions for selection and hover
                var clickEvents = self.getActionsForEvent("selection");
                var hoverEvents = self.getActionsForEvent("hover");

                // filter actions that doesn't contain fields
                var clickActions = _.filter(clickEvents, function(d) {
                    return d.mapping.srcField == fields.srcShapeField;
                });
                var hoverActions = _.filter(hoverEvents, function(d) {
                    return d.mapping.srcField == fields.srcShapeField;
                });
                if (clickActions.length)
            	{
                	clickFunction = function() {
    					var region = this.attributes.regionName.nodeValue
    					var mappings = self.options.state.mapping
    					mappings.forEach(function(m) {
        		            var selectedRecord = self.getRecordByValue(m.srcShapeField, region);
    		            	clickActions.forEach(function (currAction) {
    		                    currAction.action.doAction([selectedRecord], currAction.mapping);
    		                });
    					})
            		}
            	}
                var handleMouseover = function () {}
                
                if (self.options.state.customTooltipTemplate)
                	handleMouseover = function () {
                		
    	                var pos = $(this).offset();
    	                var selectedKpi = self.options.state.mapping[0].srcValueField;
    	                var newXLabel = self.options.state.mapping[0].srcShapeField+':';
    	                var region = this.attributes.regionName.nodeValue;
    	                var selectedRecord = self.getRecordByValue(self.options.state.mapping[0].srcShapeField, region);
    	                var val = "N/A"
    	                if (selectedRecord)
                    	{
    	                	var field = self.model.fields.get(selectedKpi)
    	                	if (field)
    	                		val = selectedRecord.getFieldValue(field)
                    	}
    	                var values = { x: region, y: val, xLabel: newXLabel, yLabel: /*kpis[*/selectedKpi/*].subtitle*/+':' }
    	                var content = Mustache.render(self.options.state.customTooltipTemplate, values);
    	                var $mapElem = $(self.el)
    	                nv.tooltip.cleanup();  // delete last tooltip if present
    	                nv.tooltip.show([pos.left /*+ leftOffset*/, pos.top/*+topOffset*/], content, (pos.left < $mapElem[0].offsetLeft + $mapElem.width()/2 ? 'w' : 'e'), null, $mapElem[0]);
    	            };
                var mouseout = function () {
                	nv.tooltip.cleanup();
                }
                if (hoverActions.length)
            	{
                    hoverFunction = function() {
    					var region = this.attributes.regionName.nodeValue
    					var mappings = self.options.state.mapping
    					mappings.forEach(function(m) {
        		            var selectedRecord = self.getRecordByValue(m.srcShapeField, region);
        		            hoverActions.forEach(function (currAction) {
    		                    currAction.action.doAction([selectedRecord], currAction.mapping);
    		                });
    					})
            		}
            	}
                else hoverFunction = handleMouseover
        	}
            
	        d3v3.json(mapJson, function(error, map) {
	        	self.mapObj = map
	        	self.regionNames = _.pluck(self.mapObj.objects[layer].geometries, 'id')   // build list of names for later use
	        	
	        	var regions = topojson.object(map, map.objects[layer]);
	
	        	var projection = d3v3.geo.mercator()
	        		.center(self.options.state["center"])
	        		.rotate(rotation)
	        		.scale(self.options.state["scale"])
	        		.translate([self.mapWidth / 2, self.mapHeight / 2]);
	        	
	        	var path = d3v3.geo.path().projection(projection);
	        	
	        	var assignColors = function() {
	        		return self.unselectedColor;
	        	}
	        	if (randomColors)
	        		assignColors = function() {
		        		var c = Math.floor(Math.random()*4+6)
		        		var h = Math.floor(Math.random()*2)*8
		        		return "#"+c+h+c+h+c+h; 
	        	}
	        	// draw regions
	        	self.svg.selectAll(".region")
		            .data(regions.geometries)
		        	.enter().append("path")
		        	.on("click", clickFunction)
		        	.on("mouseover", hoverFunction)
		        	.on("mouseout", mouseout)
		            .attr("class", function(d) { return "region " + toAscii(d.id); })
		            .attr("regionName", function(d) { return d.id; })
		        	.attr("fill", assignColors)
		            .attr("d", path)
	
	        	// draw region names
	            if (showRegionNames)
            	{
	            	var minArea = self.options.state["minRegionArea"] || 6 
	            	var onlyBigRegions = {
	            							geometries: _.filter(map.objects[layer].geometries, function(r) { return r.properties.Shape_Area > minArea}),
	            							type: "GeometryCollection"
	            						}
		        	self.svg.selectAll(".region-label")
			            .data(topojson.object(map, onlyBigRegions).geometries)
			            .enter().append("text")
			            .attr("class", function(d) { return "region-label " + toAscii(d.id); })
			            .attr("transform", function(d) { return "translate(" + path.centroid(d) + ")"; })
			            .attr("regionName", function(d) { return d.id; })
			            .attr("dy", ".35em")
			        	.on("click", clickFunction)
			        	.on("mouseover", hoverFunction)
			        	.on("mouseout", mouseout)
			            .text(function(d) { return d.id; });
            	}
	        	
	        	if (map.objects.cities && showCities)
	        	{
	        		// draw circles for cities
	        		self.svg.append("path")
		        	    .datum(topojson.object(map, map.objects.cities))
		        	    .attr("d", path)
		        	    .attr("class", "place");
	        		
	        		// draw city names
	        		self.svg.selectAll(".place-label")
		        	    .data(topojson.object(map, map.objects.cities).geometries)
		        		.enter().append("text")
		        	    .attr("class", "place-label")
		        	    .attr("transform", function(d) { return "translate(" + projection(d.coordinates) + ")"; })
		        	    .attr("dy", ".35em")
		        	    .attr("dx", ".8em")
		        	    .text(function(d) { return d.properties.name; });
	        	}
	        	if (randomColors == null || typeof randomColors == "undefined")
	        		self.redraw(); // apply color schema colors if present
	        });
	        this.rendered = true;
            return this;
        },

        redraw:function () {
            var self = this;
        	
            if(!self.rendered || !self.mapObj)
                return;
            
            var layer = this.options.state["layer"];
            var mapping = this.options.state["mapping"];

            _.each(mapping, function (currentMapping) {
                var filteredResults = self._getDataFor(
                    self.regionNames,
                    currentMapping["srcShapeField"],
                    currentMapping["srcValueField"]);

	            self.svg.selectAll("path.region")
					.attr("fill", function () {
						var region = this.attributes.regionName.nodeValue 
						//console.log(region)
                        var res = filteredResults[region];

                        // check if current shape is present into results
                           if(res != null)
                                return res.color;
                            else
                                return self.unselectedColor;
                    });
            });


        },


        // todo this is not efficient, a list of data should be built before and used as a filter
        // to avoid arrayscan
        _getDataFor:function (paths, srcShapeField, srcValueField) {
            var self=this;
            var resultType = "filtered";
            if (self.options.useFilteredData !== null && self.options.useFilteredData === false)
                resultType = "original";

            var records = self.model.getRecords(resultType);  //self.model.records.models;
            var srcShapef = self.model.fields.get(srcShapeField);
            var srcValuef = self.model.fields.get(srcValueField);

            var selectionActive = false;
            if (self.model.queryState.isSelected())
                selectionActive = true;

            var res = {};
            if (srcShapef && srcValuef)
        	{
	            _.each(records, function (d) {
	
	                if(_.contains(paths, d.getFieldValueUnrendered(srcShapef))) {
	                    var color = self.unselectedColor;
	                    if(selectionActive) {
	                        if(d.isRecordSelected())
	                            color = d.getFieldColor(srcValuef);
	                    }
	                    else 
	                    {
	                    	var newColor = d.getFieldColor(srcValuef);
	                        if (newColor != null) 
	                        	color = newColor; 
	                    }
	
	                    res[d.getFieldValueUnrendered(srcShapef)] =  {record: d, field: srcValuef, color: color, value:d.getFieldValueUnrendered(srcValuef) };
	
	                }
	            });
        	}
            //else throw "Invalid model for map! Missing "+srcShapeField+" and/or "+srcValueField
            return res;
        },
        getRecordByValue:function (srcShapeField, value) {
            var self=this;
            var resultType = "filtered";
            if (self.options.useFilteredData !== null && self.options.useFilteredData === false)
                resultType = "original";

            var records = self.model.getRecords(resultType);  //self.model.records.models;
            var srcShapef = self.model.fields.get(srcShapeField);

            return _.find(records, function(d) { return d.getFieldValueUnrendered(srcShapef) == value; });
        },        

        getActionsForEvent:function (eventType) {
            var self = this;
            var actions = [];

            _.each(self.options.actions, function (d) {
                if (_.contains(d.event, eventType))
                    actions.push(d);
            });

            return actions;
        }


    });


})(jQuery, recline.View);

this.recline = this.recline || {};
this.recline.View = this.recline.View || {};

(function ($, view) {
	
	"use strict";

    view.D3Sparkline = Backbone.View.extend({
        template: '<div id="{{uid}}" style="width: {{width}}px; height: {{height}}px;"> <div> ',

        initialize: function (options) {

            this.el = $(this.el);
    		_.bindAll(this, 'render', 'redraw');
                     

            this.model.bind('change', this.render);
            this.model.fields.bind('reset', this.render);
            this.model.fields.bind('add', this.render);

            this.model.bind('query:done', this.redraw);
            this.model.queryState.bind('selection:done', this.redraw);


			$(window).resize(this.resize);
            this.uid = options.id || ("d3_" + new Date().getTime() + Math.floor(Math.random() * 10000)); // generating an unique id for the chart
            this.width = options.width;
            this.height = options.height;

            if(!this.options.animation) {
                this.options.animation = {
                    duration: 2000,
                    delay: 200
                }
            }

            //render header & svg container
            var out = Mustache.render(this.template, this);
            this.el.html(out);

        },
        
        resize: function(){

        },

        render: function () {
            var self=this;
            var graphid="#" + this.uid;

            if(self.graph)
                jQuery(graphid).empty();

            self.graph = d3.select(graphid)
                .append("svg:svg")
                .attr("width", "100%")
                .attr("height", "100%")
                .style("stroke", function() { return self.options.color || "steelblue"; })
                .style("stroke-width", 1)
                .style("fill", "none");
        },

        redraw: function () {     
            console.log("redraw");
            var field = this.model.fields.get(this.options.field);
            var records = _.map(this.options.model.getRecords(this.options.resultType.type), function(record) {
                return record.getFieldValueUnrendered(field);
            });



            this.drawD3(records, "#" + this.uid);
        },
        drawD3: function(data, graphid) {
            var self=this;


                // X scale will fit values from 0-10 within pixels 0-100
            var x = d3.scale.linear().domain([0, data.length]).range([0, this.width]);
            // Y scale will fit values from 0-10 within pixels 0-100
            var y = d3.scale.linear().domain([_.min(data), _.max(data)]).range([0, this.height]);

            // create a line object that represents the SVN line we're creating
            var line = d3.svg.line()
                // assign the X function to plot our line as we wish
                .x(function(d,i) {
                    // verbose logging to show what's actually being done
                    //console.log('Plotting X value for data point: ' + d + ' using index: ' + i + ' to be at: ' + x(i) + ' using our xScale.');
                    // return the X coordinate where we want to plot this datapoint
                    return x(i);
                })
                .y(function(d) {
                    // verbose logging to show what's actually being done
                    //console.log('Plotting Y value for data point: ' + d + ' to be at: ' + y(d) + " using our yScale.");
                    // return the Y coordinate where we want to plot this datapoint
                    return y(d);
                })


            // display the line by appending an svg:path element with the data line we created above
            if(self.alreadyDrawed)
                self.graph.select("path").transition().duration(self.options.animation.duration).delay(self.options.animation.delay).attr("d", line(data));
            else
                self.graph.append("svg:path").attr("d", line(data));

            self.alreadyDrawed = true;
        }

    });
})(jQuery, recline.View);this.recline = this.recline || {};
this.recline.View = this.recline.View || {};

(function ($, view) {
	
	"use strict";	

	var fetchRecordValue = function(record, dimension){
		var val = null;		
		dimension.fields.forEach(function(field, i){
			if(i==0) val = record.getFieldValue(field);
			else val+= record.getFieldValue(field);
		});
		return val;
	};

	var frv = fetchRecordValue;
	
	var rowClick = function(actions, activeRecords){
				
		return function(row){
			if(actions.length && row){
				//console.log("rowClick");	
						
				var ctrlKey = d3.event.ctrlKey;
				var adding = !d3.select(d3.event.target.parentNode).classed("info");

				if(adding){
					if(ctrlKey){
						activeRecords.push(row);
					}else{
						activeRecords = [row];
					}
				}else{
					if(ctrlKey){
						activeRecords = _.difference(activeRecords, [row]);
					}else{
						activeRecords = [];
					}
				}
				
				actions.forEach(function(actioncontainer){				
					actioncontainer.action.doAction(activeRecords, actioncontainer.mapping);
				});
								
				
			}		
		};
	};
	
	var rowOver = function(actions,activeRecords){
		return function(row){
			if(actions.length && row){
                activeRecords = [];
                activeRecords.push(row);

                actions.forEach(function(actioncontainer){
                    actioncontainer.action.doAction(activeRecords, actioncontainer.mapping);
                });
			}
		};		
	};
	
	var scrollBarWidth = function(){
		  document.body.style.overflow = 'hidden'; 
		  var width = document.body.clientWidth;
		  document.body.style.overflow = 'scroll'; 
		  width -= document.body.clientWidth; 
		  if(!width) width = document.body.offsetWidth - document.body.clientWidth;
		  document.body.style.overflow = ''; 
		  return width; 
	};

	var sort=function(rowHeight, tableId) {
	    return function (dimension) {
	        var dimensionName = dimension.fields[0].id,
	            descending = d3.select(this)
	                .classed("g-ascending");

	        d3.selectAll(".g-descending")
	            .classed("g-descending", false);
	        d3.selectAll(".g-ascending")
	            .classed("g-ascending", false);

	        if (!descending) {
	            d3.select(this)
	                .classed("g-ascending", true);
	            var orderQuantitative = function (a, b) {
	                return (isNaN(frv(a, dimension)) - isNaN(frv(b, dimension))) || (frv(a, dimension) - frv(b, dimension)) || (a.index - b.index);
	            };

	            var orderName = function (a, b) {
	                return b.name.localeCompare(a.name);
	            };
	        } else {
	            d3.select(this)
	                .classed("g-descending", true);

	            var orderQuantitative = function (a, b) {
	                return (isNaN(frv(b, dimension)) - isNaN(frv(a, dimension))) || (frv(b, dimension) - frv(a, dimension)) || (b.index - a.index);
	            };

	            var orderName = function (a, b) {
	                return a.name.localeCompare(b.name);
	            };
	        }

	        d3.selectAll("#"+tableId+" .g-tbody .g-tr")
	            .sort(dimensionName === "name" ? orderName : orderQuantitative)
	            .each(function (record, i) {
	            record.index = i;
	        })
	            .transition()
	            .delay(function (record, i) {
	            return (i - 1) * 10;
	        })
	            .duration(750)
	            .attr("transform", function (record, i) {
	            return "translate(0," + i * rowHeight + ")";
	        });
	    }
	};
	
	var computeWidth=function(view){		
		var tbodycontainer =  d3.select('#'+view.graphId+' .g-tbody-container');
		var thead = view.el.find('.g-thead');
		var tbody = d3.select('#'+view.graphId +' .g-tbody');
		var tfoot = d3.select('#'+view.graphId +' .g-tfoot');
		
		var translationAcc = 0;
		var translationRectAcc = 0;
		
		return d3.sum(view.columns, function(column, i){
            	var th = thead.find('.g-th:nth-child('+(i+1)+')');
            	column.padding_left = parseInt(th.css("padding-left").replace("px", ""));
                column.padding_right = parseInt(th.css("padding-right").replace("px", ""));
                column.computed_width = th.outerWidth(true);               

				column.fields.forEach(function (field, fieldI) {
					field.width = column.width;
					field.computed_width = column.computed_width;					
				});
	           
				var transl = translationAcc;
				translationAcc += column.computed_width;
				column.translation = transl;
				
				if (column.scale) {
                	var scale = column.scale(view.model.records.models, column.computed_width, (column.range || 1.0));
                    //dimension.scale = scale.scale; //mantain the orginal function
                    column.d3scale = scale.scale;
                    column.axisScale = scale.axisScale;
                    column.fields.forEach(function (field, i) {
                        field.scale = column.d3scale;
                        field.axisScale = column.axisScale[field.id];
                    });
                }
						
            	return column.computed_width;
            });
	};


    view.D3table = Backbone.View.extend({
        className: 'recline-table-editor',
        template: ' \
  				<div id="{{graphId}}" class="g-table g-table-hover g-table-striped g-table-bordered"> \
  					<h2 class="g-title">{{title}}</h2> \
  					<p class="lead">{{instructions}}</p> \
  					<small>{{summary}}</small> \
  				\
  				<div> \
  				\
  			',
        templateHeader: ' \
        			<div class="g-thead"> \
  						<div class="g-tr"> \
  							{{#columns}} \
  							<div class="g-th {{#sortable}}g-sortable{{/sortable}}" style="width: {{hwidth}}"><div>{{label}}</div></div> \
  							{{/columns}} \
  						</div> \
  					</div> \
  					\
  					',
        templateBody: ' \
  					<div class="g-tbody-container" style="width:{{scrollWidth}}px; height:{{height}}px;"> \
  						<div style="width:{{width}}px;"> \
  							<svg class="g-tbody"> \
							</svg> \
						</div> \
					</div> \
					\
  					',
        templateFooter: '\
  					<div class="g-tfoot-container"> \
						<svg class="g-tfoot"> \
						</svg> \
					</div> \
					\
					',
        events: {
            'click .g-thead': 'onEvent'
        },
        initialize: function (options) {
            
            _.defaults(options.conf,{"row_height": 20, "height":200});
            options.actions = options.actions || [];
            this.el = $(this.el);
    		_.bindAll(this, 'render', 'redraw', 'refresh', 'resize');
                     
            this.rowHeight = options.conf.row_height;
            
            var clickActions=[], hoverActions=[];
            //processing actions
            {
            	options.actions.forEach(function(action){
            		action.event.forEach(function(event){
            			if(event==='selection') clickActions.push(action);
            			else if(event==='hover')  hoverActions.push(action);
            		});
            	});
            }           
            
            this.clickActions = clickActions;
            this.hoverActions = hoverActions; 

            this.model.bind('change', this.render);
            this.model.fields.bind('reset', this.render);
            this.model.fields.bind('add', this.render);

            this.model.bind('query:done', this.redraw);
            this.model.queryState.bind('selection:done', this.redraw);


			$(window).resize(this.resize);

			//create a nuew columns array with default values 
            this.columns = _.map(options.columns, function (column) {
                return _.defaults(column, {
                    label: "",
                    type: "text",
                    sortable: false,
                    fields: {}
                });
            });
            
            //render table  				
            this.columns.forEach(function (column, i) {
            	column.width = column.width || 160;
                column.hwidth = column.width;
            }, this);
            
            this.height = options.conf.height;
            this.title = options.title;
            this.summary = options.summary;
            this.instructions = options.instructions;
            this.graphId = options.id || 'd3table_'+Math.floor(Math.random()*1000);

            //render header & svg container
            var out = Mustache.render(this.template, this);
            this.el.html(out);
            this.el.find('#'+this.graphId).append(Mustache.render(this.templateHeader, this));
            
            this.width = options.conf.width;
            //this.render(); 								
        },
        
        resize: function(){
        	console.log('resize');
        	var tbodycontainer =  d3.select('#'+this.graphId+' .g-tbody-container');
        	var tbody = d3.select('#'+this.graphId +' .g-tbody');
        	var tfoot = d3.select('#'+this.graphId +' .g-tfoot');
        	        	
        	this.width = computeWidth(this);            
            this.scrollWidth = scrollBarWidth()+this.width;            
            
            this.el.find('.g-tbody-container').css('width',this.scrollWidth);
            this.el.find('.g-tbody-container > div').css('width',this.width);
            
            var row = tbodycontainer.select('.g-tbody')
                .selectAll(".g-tr");
                
            row.each(function (record) {
            	 var cell = d3.select(this)
                    .selectAll(".g-td").attr("transform", function (dimension, i) {
                    	return "translate(" + (dimension.translation+dimension.padding_left) + ")";
                	});
                	
                
            	//move and resize barchart
            					//barchart               
                var barChartCell = cell.filter(function (dimension) {           	
                    return dimension.scale && dimension.type === 'barchart';
                });
                barChartCell.selectAll(".g-bar").attr("width", function (field, index) {
                    	return field.scale(record.getFieldValue(field));
               		})
                    .attr("transform", function (field, i) {
                    	                    	
	                    var translation = Math.ceil((i === 0) ? ((field.computed_width) / 2) - field.scale(record.getFieldValue(field)) : i * (field.computed_width) / 2);
	
	                    if (i == 0) {
	                        return "translate(" + translation + ")";
	                    } else {
	                        return "translate(" + translation + ")";
	                    }
                	});            	
            });   
                 
            //move vertical lines
            {
            	tbodycontainer.select('.g-tbody').selectAll(".g-column-border").attr("class", "g-column-border").attr("transform", function(dimension) {
					return "translate(" + (dimension.translation) + ",0)";
				}).attr("y2", "100%");
            }     
            
            //move compare lines
            tbodycontainer.select('.g-tbody').selectAll(".g-compare").data(this.columns.filter(function(column) {
				return column.scale;
			})).attr("transform", function(column) {
				return "translate(" + (column.translation+column.padding_left+column.computed_width/2) + ",0)";
			}).attr("y2", "100%");        
            
            //move axis
            {
            	var axisRow = d3.select('#'+this.graphId+' .g-tfoot');
	            
	            var cell = axisRow.selectAll('.g-td')
	                    .attr("width", function (dimension, i) {
	                    	return (dimension.computed_width);
	                	})
	                	.attr("transform", function (dimension, i) {
	                    	return "translate(" + (dimension.translation+dimension.padding_left)+ ")";
                		});
	            
	            var barChartCell = cell.filter(function (dimension) {
                    return dimension.scale && dimension.type === 'barchart';
                });
                
				barChartCell.selectAll(".g-axis").remove();
                
				var fieldNum;
                var range;	
				barChartCell.selectAll(".g-axis").data(function (dimension) {
                		fieldNum = dimension.fields.length;
                		range = dimension.range;
                    	return dimension.fields;
               	  })
               	  .enter()
               	  .append('g')
               	  .attr('class', function(field,i){
               	  	return 'g-axis';
               	  })
               	  .attr("transform", function (field, i) {
               	  			var trans = 0;
               	  			var w = field.computed_width/fieldNum;
               	  			            	  			
               	  			if(i==0) trans = w - w*range;
               	  			else trans = i * w;
               	  			
               	  			return "translate(" + trans + ")";
                		})
               	  .each(function(field, i){
               	  		var axis = d3.svg.axis().scale(field.axisScale).ticks(Math.abs(field.axisScale.range()[1] - field.axisScale.range()[0]) / 80).orient("bottom");
               	  		d3.select(this).call(axis);
               	  	});
                             	  	
           }          		    
           
            
        },
        refresh: function() {
			console.log('d3Table.refresh');

        },
        reset: function () {
            console.log('d3Table.reset');
        },
        render: function () {
            console.log('d3Table.render');
            
            //render table divs            
            //manage width and scrolling
			this.width = computeWidth(this);
            this.scrollWidth = scrollBarWidth()+this.width;
            
            //compile mustache templates
            this.el.find('#'+this.graphId).append(Mustache.render(this.templateBody, this)).append(Mustache.render(this.templateFooter, this));
            
			//merge columns with dimensions
            this.columns.forEach(function (column, i) {
                column.fields = recline.Data.Aggregations.intersectionObjects('id', column.fields, this.model.fields.models);
                column.index = i;
            }, this);
        },
        redraw: function () {     
            console.log('d3Table.redraw');   
            
            var rowHeight = this.rowHeight;
            var columns = this.columns;
            var records = this.model.records.models;
            var activeRecords = []; 
            
			records.forEach(function (record, i) {
                record.index = i;
                if(record.isRecordSelected()) activeRecords.push(record);
            });
            
            //manage width and scrolling
			this.width = computeWidth(this); //this function compute width for each cells and adjust scales
            this.scrollWidth = scrollBarWidth()+this.width;
            
            var tbodycontainer = d3.select('#'+this.graphId+' .g-tbody-container');
            
            tbodycontainer.select('div').style('height',(rowHeight)*records.length+'px');            
            tbodycontainer.classed('g-tbody-container-overflow',(rowHeight)*records.length>this.height);
            
            tbodycontainer.selectAll('.g-tbody .g-tr').remove();            			
            var row = tbodycontainer.select('.g-tbody')
              .selectAll(".g-tr")
              .data(records)
              .enter()
              .append("g")
                .attr("class", "g-tr")
                .attr("transform", function (record, i) {
                	return "translate(0," + i * (rowHeight) + ")";
            	}).classed('info',function(record, i){
            		return record.isRecordSelected();
            	});

            row.append("rect")
                .attr("class", "g-background")
                .attr("width", "100%")
                .attr("height", rowHeight)
                .on('click', rowClick(this.clickActions, activeRecords))
                .on('mouseover', rowOver(this.hoverActions, activeRecords));

            row.each(function (record) {
								
                var cell = d3.select(this)
                  .selectAll(".g-td")
                  .data(columns)
                  .enter()
                  .append("g")
                    .attr("class", "g-td")
                    .classed("g-quantitative", function (dimension) {
                    	return dimension.scale;
                	}).classed("g-categorical", function (dimension) {
                    	return dimension.categorical;
                	}).attr("transform", function (dimension, i) {
                    	return "translate(" + (dimension.translation+dimension.padding_left) + ")";
                	});
                	
                //horizontal lines
               	d3.select(this).append('line').attr('class', 'g-row-border').attr('y1',rowHeight).attr('y2',rowHeight).attr('x2','100%');
               
				//barchart               
                var barChartCell = cell.filter(function (dimension) {           	
                    return dimension.scale && dimension.type === 'barchart';
                });
                barChartCell.selectAll(".g-bar")
                  .data(function (dimension) {
                    	return dimension.fields;
               	  })
                  .enter()
                  .append("rect")
                    .attr("class", "g-bar")
                    .attr("width", function (field, index) {
                    	return field.scale(record.getFieldValue(field));
               		})
                    .attr("height", rowHeight-1)
                    .attr("transform", function (field, i) {
                    	                    	
	                    var translation = Math.ceil((i === 0) ? ((field.computed_width) / 2) - field.scale(record.getFieldValue(field)) : i * (field.computed_width) / 2);
												
	                    if (i == 0) {
	                        return "translate(" + translation + ")";
	                    } else {
	                        return "translate(" + translation + ")";
	                    }
                	})
                    .style("fill", function (field, index) {
                    	return field.color;
                	});


                cell.filter(function (dimension) {           	
                    return !dimension.scale;
                }).append("text")
                    .attr("class", "g-value")
                    .attr("x", function (dimension) {
                    return dimension.scale ? 3 : 0;
                })
                    .attr("y", function (dimension) {
                    return dimension.categorical ? 9 : 10;
                })
                    .attr("dy", ".35em")
                    .classed("g-na", function (dimension) { //null values
                    return frv(record, dimension) === undefined;
                })
                    .text(function (dimension) {
                    return frv(record, dimension);
                })
                    .attr("clip-path", function (dimension) {
                    return (dimension.clipped = this.getComputedTextLength() > ((dimension.computed_width))-20) ? "url(#g-clip-cell)" : null;
                });

                cell.filter(function (dimension) {
                    return dimension.clipped;
                }).append("rect")
                    .style("fill", "url(#g-clip-gradient)")
                    .attr("x", function (dimension) {
                    	return dimension.hwidth;
                	})
                    .attr("width", 20)
                    .attr("height", rowHeight);
            });
            
            //axis management
            {
				var tfoot = d3.select('#'+this.graphId+' .g-tfoot');
				tfoot.selectAll('.axisRow').remove();						
				var axisRow = tfoot.append("g")
	                .attr("class", "axisRow");
	                	            
	            var cell = axisRow.selectAll('.g-td').data(columns).enter().append('g')
	                    .attr("class", "g-td")
	                    .attr("width", function (dimension, i) {
	                    	return (dimension.computed_width);
	                	})
	                	.attr("transform", function (dimension, i) {
	                    	return "translate(" + (dimension.translation+dimension.padding_left)+ ")";
                		});
	            
	            var barChartCell = cell.filter(function (dimension) {
                    return dimension.scale && dimension.type === 'barchart';
                });
                
                var fieldNum;
                var range;
                barChartCell.selectAll(".g-axis").data(function (dimension) {
                		fieldNum = dimension.fields.length;
                		range = dimension.range;
                    	return dimension.fields;
               	  })
               	  .enter()
               	  .append('g')
               	  .attr('class', function(field,i){
               	  	return 'g-axis';
               	  })
               	  .attr("transform", function (field, i) {
               	  			var trans = 0;
               	  			var w = field.computed_width/fieldNum;
               	  			            	  			
               	  			if(i==0) trans = w - w*range;
               	  			else trans = i * w;
               	  			
               	  			return "translate(" + trans + ")";
                		})
               	  .each(function(field, i){
               	  		var axis = d3.svg.axis().scale(field.axisScale).ticks(Math.abs(field.axisScale.range()[1] - field.axisScale.range()[0]) / 80).orient("bottom");
               	  		d3.select(this).call(axis);
               	  	});        
               	  	
            }

			//add sorting
            d3.selectAll('#'+this.graphId+' .g-thead .g-th.g-sortable')
                .data(columns)
                .on("click", sort(rowHeight, this.graphId));    
                
            //vertical lines
            {
            	tbodycontainer.select('.g-tbody').selectAll(".g-column-border").remove();
            	tbodycontainer.select('.g-tbody').selectAll(".g-column-border").data(columns)
            	.enter().append("line").attr("class", "g-column-border").attr("transform", function(dimension) {
					return "translate(" + (dimension.translation) + ",0)";
				}).attr("y2", "100%");
            }            

			//axis lines
			{
				tbodycontainer.select('.g-tbody').selectAll(".g-compare").remove();
				tbodycontainer.select('.g-tbody').selectAll(".g-compare").data(columns.filter(function(dimension) {
					return dimension.scale;
				})).enter().append("line").attr("class", "g-compare").attr("transform", function(dimension) {
					return "translate(" + (dimension.translation+dimension.padding_left + dimension.computed_width/2) + ",0)";
				}).attr("y2", "100%"); 
			}
			
        },
        onEvent: function (e) {}
    });
})(jQuery, recline.View);this.recline = this.recline || {};
this.recline.View = this.recline.View || {};

(function ($, view) {
	
	"use strict";

    view.D3Treemap = Backbone.View.extend({
        template: '<div id="{{uid}}" style="width: {{width}}px; height: {{height}}px;"> <div> ',

        initialize: function (options) {

            this.el = $(this.el);
    		_.bindAll(this, 'render', 'redraw');
                     

            this.model.bind('change', this.render);
            this.model.fields.bind('reset', this.render);
            this.model.fields.bind('add', this.render);

            this.model.bind('query:done', this.redraw);
            this.model.queryState.bind('selection:done', this.redraw);


			$(window).resize(this.resize);
            this.uid = options.id || ("d3_" + new Date().getTime() + Math.floor(Math.random() * 10000)); // generating an unique id for the chart
            this.width = options.width;
            this.height = options.height;

            if(!this.options.animation) {
                this.options.animation = {
                    duration: 2000,
                    delay: 200
                }
            }

            //render header & svg container
            var out = Mustache.render(this.template, this);
            this.el.html(out);

        },
        
        resize: function(){

        },

        render: function () {
            var self=this;
            var graphid="#" + this.uid;

            if(self.graph)
                jQuery(graphid).empty();


            self.treemap = d3.layout.treemap()
                 .size([this.width, this.height])
                 .sticky(false)
                 .value(function(d) {
                    console.log(d);
                    return d.size; });

            self.color = d3.scale.category20c();



            self.div = d3.select(graphid).append("div")
                .style("position", "relative")
                .style("width", this.width + "px")
                .style("height", this.height + "px");
        },

        redraw: function () {     
            console.log("redraw");
            var fieldValue = this.model.fields.get(this.options.fieldValue);
            var fieldName = this.model.fields.get(this.options.fieldName);

            var records = _.map(this.options.model.getRecords(this.options.resultType.type), function(record) {
                return {name: record.getFieldValue(fieldName), size: record.getFieldValueUnrendered(fieldValue) };
            });



            this.drawD3(records, "#" + this.uid);
        },
        drawD3: function(data, graphid) {
            var self=this;

            function cell() {
                this
                    .style("left", function(d) { return d.x + "px"; })
                    .style("top", function(d) { return d.y + "px"; })
                    .style("width", function(d) { return Math.max(0, d.dx - 1) + "px"; })
                    .style("height", function(d) { return Math.max(0, d.dy - 1) + "px"; });
            }

            var leaves = self.treemap(data);


            _.each(data, function(x) {
                self.div.data([x]).selectAll("div")
                    .data(self.treemap.nodes)
                    .enter().append("div")
                    .attr("class", "cell")
                    .style("background", function(d) { self.color(d.name); })
                    .call(cell)
                    .text(function(d) {
                        console.log(d);
                        return d.name; });

            });






            // display the line by appending an svg:path element with the data line we created above
            /*if(self.alreadyDrawed)
                self.graph.select("path").transition().duration(self.options.animation.duration).delay(self.options.animation.delay).attr("d", line(data));
            else
                self.graph.append("svg:path").attr("d", line(data));
            */
            self.alreadyDrawed = true;
        }

    });
})(jQuery, recline.View);