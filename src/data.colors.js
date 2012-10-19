// # Recline Backbone Models
this.recline = this.recline || {};
this.recline.Data = this.recline.Data || {};
this.recline.Data.ColorSchema = this.recline.Data.ColorSchema || {};

(function($, my) {



    my.ColorSchema = Backbone.Model.extend({
        constructor: function ColorSchema() {
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

            if(this.attributes.twoDimensionalVariation) {
                if(this.attributes.twoDimensionalVariation.data) {
                    var data = this.attributes.twoDimensionalVariation.data;
                    self._generateVariationLimits(data);
                }else if(this.attributes.twoDimensionalVariation.dataset)  {
                    this.bindToVariationDataset();
                }
            }
        },

        bindToDataset: function() {
           var self=this;
            self.attributes.dataset.dataset.records.bind('reset',   function() { self._generateFromDataset(); });
            if(self.attributes.dataset.dataset.records.models.length > 0) {
                self._generateFromDataset();
            }
        },

        bindToVariationDataset: function() {
            var self=this;
            self.attributes.twoDimensionalVariation.dataset.dataset.records.bind('reset',   function() { self._generateFromVariationDataset(); });
            if(self.attributes.twoDimensionalVariation.dataset.dataset.records.models.length > 0) {
                self._generateFromVariationDataset();
            }
        },

        setDataset: function(ds, field) {
            var self=this;
            self.attributes.dataset = {dataset: ds, field: field};
            if(!ds.attributes["colorSchema"])
                ds.attributes["colorSchema"] = [];

            ds.attributes["colorSchema"].push({schema:self, field: field});

            ds.setColorSchema();

            self.bindToDataset();
        },

        setVariationDataset: function(ds, field) {
            var self=this;
            self.attributes.twoDimensionalVariation.dataset = {dataset: ds, field: field};

            self.bindToVariationDataset();
        },

        _generateFromDataset: function() {
            var self=this;
            var data =  this.getRecordsArray(self.attributes.dataset);
            self._generateLimits(data);

        },

        _generateFromVariationDataset: function() {
            var self=this;
            var data =  this.getRecordsArray(self.attributes.twoDimensionalVariation.dataset);
            self._generateVariationLimits(data);


        },

        _generateLimits: function(data) {
            var self=this;
            switch(this.attributes.type) {
                case "scaleWithDataMinMax":
                    self.schema =  new chroma.ColorScale({
                        colors: this.attributes.colors,
                        limits: this.limits["minMax"](data)
                    });
                    break;
                case "scaleWithDistinctData":
                    self.schema =  new chroma.ColorScale({
                        colors: this.attributes.colors,
                        limits: this.limits["distinct"](data)
                    });
                    break;
                default:
                    throw "data.colors.js: unknown or not defined properties type " + this.attributes.type;
            }
        },
        
        getScaleType: function() {
        	return this.attributes.type;
        },
        
        getScaleLimits: function() {
        	return this.schema.limits;
        },

        _generateVariationLimits: function(data) {
            var self=this;
            self.variationLimits = this.limits["minMax"](data);
        },

        getColorFor: function(fieldValue) {
            var self=this;
            if(this.schema == null)
                throw "data.colors.js: colorschema not yet initialized, datasource not fetched?"


            return this.schema.getColor(recline.Data.Transform.getFieldHash(fieldValue)) ;
        },

        getTwoDimensionalColor: function(startingvalue, variation) {
            if(this.schema == null)
                throw "data.colors.js: colorschema not yet initialized, datasource not fetched?"

            if(this.attributes.twoDimensionalVariation == null)
                return this.getColorFor(startingvalue);

            var endColor = '#000000';
            if(this.attributes.twoDimensionalVariation.type == "toLight")
                endColor = '#ffffff';


            var self=this;

            var tempSchema = new chroma.ColorScale({
                colors: [self.getColorFor(startingvalue), endColor],
                limits: self.variationLimits,
                mode: 'hsl'
            });

            return tempSchema.getColor(variation);

        },

        getRecordsArray: function(dataset) {
            var self=this;
            var ret = [];

            if(dataset.dataset.isFieldPartitioned(dataset.field))   {
                var fields = dataset.dataset.getPartitionedFields(dataset.field);
            _.each(dataset.dataset.records.models, function(d) {
                _.each(fields, function (field) {
                    ret.push(d.attributes[field.id]);
                });
            });
            }
            else{
                var  fields = [dataset.field];;
                _.each(dataset.dataset.records.models, function(d) {
                    _.each(fields, function (field) {
                        ret.push(d.attributes[field]);
                    });
                });
            }



            return ret;
        },



        limits: {
            minMax: function(data) {
                var limit = [null, null];
                _.each(data, function(d) {
                    if(limit[0] == null)    limit[0] = d;
                    else                    limit[0] = Math.min(limit[0], d);

                    if(limit[1] == null)    limit[1] = d;
                    else                    limit[1] = Math.max(limit[1], d);
                });

                return limit;
            },
            distinct: function(data) {
                _.each(_.uniq(data), function(d, index) {
                    data[index]=recline.Data.Transform.getFieldHash(d);
                });
                return data;
            }

        }






    })
}(jQuery, this.recline.Data));
