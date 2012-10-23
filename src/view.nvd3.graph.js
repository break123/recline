/*jshint multistr:true */

this.recline = this.recline || {};
this.recline.View = this.recline.View || {};

(function($, my) {

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

  template: '<div class="recline-graph"> \
      <div class="panel nvd3graph_{{viewId}}"style="display: block;"> \
        <div id="nvd3chart_{{viewId}}"><svg class="bstrap"></svg></div>\
      </div> \
    </div> ',

  initialize: function(options) {
    var self = this;
    this.uid = ""+new Date().getTime()+Math.floor(Math.random()*10000); // generating an unique id for the chart
    this.el = $(this.el);
    _.bindAll(this, 'render', 'redraw');


    this.model.bind('change', this.render);
    this.model.fields.bind('reset', this.render);
    this.model.fields.bind('add', this.render);

    this.model.bind('query:done', this.redraw);
    this.model.queryState.bind('selection:done', this.redraw);


    var stateData = _.extend({
        group: null,
            seriesNameField: [],
            seriesValues: [],
            colors: ["#edc240", "#afd8f8", "#cb4b4b", "#4da74d", "#9440ed"],
            graphType: "lineChart",
            xLabel: "",
            id: 0



      },
      options.state
    );
    this.state = new recline.Model.ObjectState(stateData);


  },

  render: function() {
    var self = this;

    var tmplData = this.model.toTemplateJSON();
    tmplData["viewId"] = this.uid;

     delete this.chart;


    var htmls = Mustache.render(this.template, tmplData);
    $(this.el).html(htmls);
    this.$graph = this.el.find('.panel.nvd3graph_' + tmplData["viewId"]);
    return this;
  },

  getActionsForEvent: function(eventType) {
      var actions = [];

      _.each(this.options.actions, function(d) {
          if( _.contains(d.event, eventType))
            actions.push(d);
          });

      return actions;
  },

  redraw: function() {

    var self=this;

        var state = this.state;
        var seriesNVD3 = this.createSeriesNVD3();

        var graphType = this.state.get("graphType") ;

        var viewId = this.uid;

        var model = this.model;
		var state = this.state;
        var xLabel = this.state.get("xLabel");
        var yLabel = this.state.get("yLabel");


        nv.addGraph(function() {
            self.chart = self.getGraph[graphType](self);

            if(self.state.attributes.options)  {
            _.each(_.keys(self.state.attributes.options), function(d) {
                try { self.addOption[d](self.chart, self.state.attributes.options[d]); }
                catch(err) { console.log("view.nvd3.graph.js: cannot add options " + d + " for graph type " + graphType)}
            });
            };

  		    d3.select('#nvd3chart_' + self.uid + '  svg')
  		    
            var chart;
            // todo per gli stacked e' necessario ciclare sulla serie per inserire dati null o zero dove non siano presenti

            switch(graphType) {
                case 'lineChart':
                    chart = nv.models.lineChart().tooltips(true);
                    break;
                case "stackedAreaChart":
                    chart = nv.models.stackedAreaChart()
                        .clipEdge(true);
                    break;
                case "multiBarHorizontalChart":
                    chart = nv.models.multiBarHorizontalChart()
                    break;
                case "bulletChart" :
                    chart = nv.models.bulletChart();
                     break;
                case "cumulativeLineChart":
                    chart = nv.models.cumulativeLineChart()
                    break;
                case "discreteBarChart":
                    chart = nv.models.discreteBarChart()
                        .staggerLabels(true)
                        .tooltips(false)
                        .showValues(true);

                    var actions = self.getActionsForEvent("selection");

                    if(actions.length > 0)
                        chart.discretebar.dispatch.on('elementClick', function(e) {
                            self.doActions(actions, [e.point.record]);
                        });
                break;
                case "multiBarChart":
                    chart = nv.models.multiBarChart().stacked(true);
                    break;
                case "lineWithBrushChart":
                    var actions = self.getActionsForEvent("selection");

                    if(actions.length > 0) {
                        chart = nv.models.lineWithBrushChart(
                            {callback: function(x) {

                            // selection is done on x axis so I need to take the record with range [min_x, max_x]
                            // is the group attribute
                            var record_min = _.min(x, function(d) { return d.min.x }) ;
                            var record_max = _.max(x, function(d) { return d.max.x });

                            self.doActions(actions, [record_min.min.record, record_max.min.record]);

                        }});

                    } else {
                        chart = nv.models.lineWithBrushChart();
                    }

                    break;
                case "multiBarWithBrushChart":
                    chart = nv.models.multiBarWithBrushChart(function(x) {
                        //self.doActions("elementSelection", e);


                    });
                    break;
                default:
                    throw "nvd3.graph.js: unsupported graph type " +    graphType;
            }

            //chart.x(function(d)    { return d.x; })
            //        .y(function(d) { return d.y; });

			var xfield =  model.fields.get(state.attributes.group);
			xfield.set('type', xfield.get('type').toLowerCase());
			
			if (xLabel == null || xLabel == "" || typeof xLabel == 'undefined')
				xLabel = xfield.get('label')

			if (yLabel == null || yLabel == "" || typeof yLabel == 'undefined')
				yLabel = state.attributes.seriesValues.join("/");

            chart.yAxis
                .axisLabel(yLabel)
                .tickFormat(d3.format('s'));

			if (xfield.get('type') == 'date' || 
				(xfield.get('type') == 'string' && xLabel.indexOf('date') >= 0 && model.recordCount > 0 && new Date(model.records.get(0).get(xLabel)) instanceof Date))
			{
				chart.xAxis
					.axisLabel(xLabel)
					.tickFormat(function(d) {
             			return d3.time.format('%x')(new Date(d)) ;
		           })   ;
			}
			else
			{
				chart.xAxis
					.axisLabel(xLabel)
					.tickFormat(d3.format(',r'));
			}


  		d3.select('#nvd3chart_' +viewId + '  svg')
      		    .datum(seriesNVD3)
    		    .transition()
                .duration(500)
      		    .call(self.chart);

  		var chartUpdate = function()
  		{
  			// this function forces the height of the container row to the chart itself on every window resize
  			
  			// this only works by previously setting the body height to a numeric pixel size (percentage size don't work)
  			// so we assign the window height to the body height with the command below
  			$("body").height($(window).innerHeight()-10);
  			
  			var currAncestor = self.el;
  			while (!currAncestor.hasClass('row-fluid') && !currAncestor.hasClass('row'))
  				currAncestor = currAncestor.parent();
  			
  			if (typeof currAncestor != "undefined" && currAncestor != null && (currAncestor.hasClass('row-fluid') || currAncestor.hasClass('row')))
			{
  				var newH = currAncestor.height();
  	  			$('#nvd3chart_' +viewId).height(newH);
  				$('#nvd3chart_' +viewId + '  svg').height(newH);
			}
  			self.chart.update(); // calls original 'update' function
  		}
  		
  		chartUpdate(); // force initial resize
  		
        nv.utils.windowResize(chartUpdate);

        return  self.chart;
    });
  },

        setAxis: function(axis, chart) {
            var self=this;

            var xLabel = self.state.get("xLabel");

            if(axis == "all" || axis == "x") {
              var xfield =  self.model.fields.get(self.state.attributes.group);

              // set label
              if (xLabel == null || xLabel == "" || typeof xLabel == 'undefined')
                  xLabel = xfield.get('label');

                // set data format
                chart.xAxis
                        .axisLabel(xLabel)
                        .tickFormat(self.getFormatter[xfield.get('type')]);

          } else if(axis == "all" || axis == "y")
          {
              var yLabel = self.state.get("yLabel");

              if (yLabel == null || yLabel == "" || typeof yLabel == 'undefined')
                  yLabel = self.state.attributes.seriesValues.join("/");

              // todo yaxis format must be passed as prop
              chart.yAxis
                  .axisLabel(yLabel)
                  .tickFormat(d3.format('s'));

          }
        },

  getFormatter: {
        "string": d3.format(',s') ,
        "float":  d3.format(',r') ,
        "integer":d3.format(',r') ,
        "date":   function(d) { return d3.time.format('%x')(new Date(d)); }

  },

  addOption: {
     "staggerLabels":   function(chart, value) {chart.staggerLabels = value;},
     "tooltips":        function(chart, value) {
         chart.tooltips = value;
     },
     "showValues":      function(chart, value) {chart.showValues = value;},
     "minmax":          function(){},
     "trendlines":      function(){}

  },


  getGraph: {
          "multiBarChart":          function(view) {
              var chart;
              if(view.chart != null)
                chart = view.chart;
              else
                chart = nv.models.multiBarChart();

              view.setAxis("all", chart);
              return chart;
          },
          "lineChart":              function(view) {
              var chart;
              if(view.chart != null)
                  chart = view.chart;
              else
                  chart = nv.models.lineChart();
              view.setAxis("all", chart);
              return chart; },
          "lineWithFocusChart":     function(view) {
              var chart;
              if(view.chart != null)
                  chart = view.chart;
              else
                  chart = nv.models.lineWithFocusChart();

              view.setAxis("all", chart);
              return chart;
          },
          "indentedTree":           function(view) {
              var chart;
              if(view.chart != null)
                  chart = view.chart;
              else
                  chart = nv.models.indentedTree();
          },
          "stackedAreaChart":       function(view) {
              var chart;
              if(view.chart != null)
                  chart = view.chart;
              else
                  chart = nv.models.stackedAreaChart();
              view.setAxis("all", chart);
              return chart;
          },

          "historicalBar":       function(view) {
            var chart;
            if(view.chart != null)
                chart = view.chart;
            else
                chart = nv.models.historicalBar();
            return chart;
    },
          "multiBarHorizontalChart":function(view) {
              var chart;
              if(view.chart != null)
                  chart = view.chart;
              else
                  chart = nv.models.multiBarHorizontalChart();
              view.setAxis("all", chart);
              return chart;
          },
          "legend":function(view) {
             var chart;
            if(view.chart != null)
              chart = view.chart;
          else
              chart = nv.models.legend();
          return chart;
      },
      "line":function(view) {
          var chart;
          if(view.chart != null)
              chart = view.chart;
          else
              chart = nv.models.line();
          return chart;
      },
      "sparkline":function(view) {
          var chart;
          if(view.chart != null)
              chart = view.chart;
          else
              chart = nv.models.sparkline();
          return chart;
      },
      "sparklinePlus":function(view) {
          var chart;
          if(view.chart != null)
              chart = view.chart;
          else
              chart = nv.models.sparklinePlus();
          return chart;
      },

      "multiChart":function(view) {
          var chart;
          if(view.chart != null)
              chart = view.chart;
          else
              chart = nv.models.multiChart();
          return chart;
      },


      "bulletChart":            function(view) {
              var chart;
              if(view.chart != null)
                  chart = view.chart;
              else
                  chart = nv.models.bulletChart();
              return chart;
          },
          "linePlusBarChart":       function(view) {
              var chart;
              if(view.chart != null)
                  chart = view.chart;
              else
                  chart = nv.models.linePlusBarChart();
              view.setAxis("all", chart);
              return chart;
          },
          "cumulativeLineChart":    function(view) {
              var chart;
              if(view.chart != null)
                  chart = view.chart;
              else
                  chart = nv.models.cumulativeLineChart();
              view.setAxis("all", chart);
              return chart;
          },
          "scatterChart":    function(view) {
              var chart;
              if(view.chart != null)
                  chart = view.chart;
              else
                  chart = nv.models.scatterChart();
            chart.showDistX(true)
                .showDistY(true);
            view.setAxis("all", chart);
            return chart;
          },
          "discreteBarChart":       function(view) {
              var actions = view.getActionsForEvent("selection");
              var chart;
              if(view.chart != null)
                  chart = view.chart;
              else
                  chart = nv.models.discreteBarChart();
              view.setAxis("all", chart);

              if(actions.length > 0)
                  chart.discretebar.dispatch.on('elementClick', function(e) {
                      view.doActions(actions, [e.point.record]);
                  });
              return chart;

          },
          "lineWithBrushChart":     function(view) {
              var actions = view.getActionsForEvent("selection");
              var options = {};

              if(view.state.attributes.options) {
                  if(view.state.attributes.options("trendlines"))
                    options["trendlines"] = view.state.attributes.options("trendlines");
                  if(view.state.attributes.options("minmax"))
                      options["minmax"] = view.state.attributes.options("minmax");

              }


              if(actions.length > 0) {
                  options["callback"]  = function(x) {

                          // selection is done on x axis so I need to take the record with range [min_x, max_x]
                          // is the group attribute
                          var record_min = _.min(x, function(d) { return d.min.x }) ;
                          var record_max = _.max(x, function(d) { return d.max.x });

                          view.doActions(actions, [record_min.min.record, record_max.max.record]);

                      };
              } else
                  options["callback"] = function() {};

              var chart;
              if(view.chart != null)
                  chart = view.chart;
              else
                  chart = nv.models.lineWithBrushChart(options);
              view.setAxis("all", chart);
              return  chart
          },
          "multiBarWithBrushChart": function(view) {
              var actions = view.getActionsForEvent("selection");
              var options = {};

              if(view.state.attributes.options) {
                  if(view.state.attributes.options("trendlines"))
                      options["trendlines"] = view.state.attributes.options("trendlines");
                  if(view.state.attributes.options("minmax"))
                      options["minmax"] = view.state.attributes.options("minmax");

              }

              if(actions.length > 0) {
                  options["callback"]  = function(x) {

                      // selection is done on x axis so I need to take the record with range [min_x, max_x]
                      // is the group attribute
                      var record_min = _.min(x, function(d) { return d.min.x }) ;
                      var record_max = _.max(x, function(d) { return d.max.x });

                      view.doActions(actions, [record_min.min.record, record_max.max.record]);

                  };
              } else
                  options["callback"] = function() {};

              var chart;
              if(view.chart != null)
                  chart = view.chart;
              else
                  chart = nv.models.multiBarWithBrushChart(options);

              return chart;
          },

          "pieChart":      function(view) {
              var chart;
              if(view.chart != null)
                  chart = view.chart;
              else
                  chart = nv.models.pieChart(); }

      },


  doActions: function(actions, records) {

      _.each(actions, function(d) {
          d.action.doAction(records, d.mapping);
      });

  },


  createSeriesNVD3: function() {

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
      if(self.state.attributes.unselectedColor)
          unselectedColor = self.state.attributes.unselectedColor;
      var selectionActive = false;
      if(self.model.queryState.isSelected())
        selectionActive = true;

      var resultType = "filtered";
      if(self.options.useFilteredData !== null && self.options.useFilteredData === false)
        resultType = "original";

      var records = self.model.getRecords(resultType);  //self.model.records.models;

      var xfield =  self.model.fields.get(self.state.attributes.group);

      if (xfield.get('type') === 'date') {
          xAxisIsDate = true;
      }

      var uniqueX = [];
      var sizeField;
      if(seriesAttr.sizeField) {
          sizeField =  self.model.fields.get(seriesAttr.sizeField);
      }


      // series are calculated on data, data should be analyzed in order to create series
     if(seriesAttr.type == "byFieldValue") {
         var seriesTmp = {};
         var seriesNameField =  self.model.fields.get(seriesAttr.seriesField);
         var fieldValue = self.model.fields.get(seriesAttr.valuesField);

         _.each(records, function(doc, index) {

             // key is the field that identiy the value that "build" series
             var key = doc.getFieldValueUnrendered(seriesNameField);
             var tmpS;

             // verify if the serie is already been initialized
             if(seriesTmp[key] != null ) { tmpS = seriesTmp[key]  }
             else {

                 var color;
                 if(selectionActive) {
                     if(doc.isRecordSelected())
                         color  = doc.getFieldColor(seriesNameField);
                     else
                         color = unselectedColor;
                 } else
                     color  = doc.getFieldColor(seriesNameField);

                 if(color != null)
                    tmpS = {key: key, values: [], color:  color};
                 else
                    tmpS = {key: key, values: []};
             };

             var x = doc.getFieldValueUnrendered(xfield);
             var y = doc.getFieldValueUnrendered(fieldValue);

             var point = {x: x, y: y, record: doc};
             if(sizeField)
                 point["size"] = doc.getFieldValueUnrendered(sizeField);

             tmpS.values.push(point);

             if(fillEmptyValuesWith != null) {
                 uniqueX.push(x);

             }

             seriesTmp[key] = tmpS;

         });

         for (var j in seriesTmp) {
             series.push(seriesTmp[j]);
         }

     }
      else if(seriesAttr.type == "byFieldName" || seriesAttr.type == "byPartitionedField"){
         var serieNames;
         if(seriesAttr.type == "byFieldName")
            serieNames =  seriesAttr.valuesField;
         else {
             serieNames = [];
             _.each(seriesAttr.aggregationFunctions, function(a) {
                 _.each(self.model.getPartitionedFieldsForAggregationFunction(a, seriesAttr.aggregatedField), function(f)
                 {
                     serieNames.push(f.get("id"));
                 })

             });

         }

       _.each(serieNames, function(field) {
          var yfield = self.model.fields.get(field);
          
          var fieldLabel = field;
          if (yfield.attributes.is_partitioned)
        	  fieldLabel = yfield.attributes.partitionValue;

          if (typeof self.state.attributes.fieldLabels != "undefined" && self.state.attributes.fieldLabels != null)
          {
	          var fieldLabel_alternateObj = _.find(self.state.attributes.fieldLabels, function(fl) {return fl.id == fieldLabel});
	          if (typeof fieldLabel_alternateObj != "undefined" && fieldLabel_alternateObj != null)
	          fieldLabel = fieldLabel_alternateObj.label;
          }
          
          var points = [];

          _.each(records, function(doc, index) {

              var x = doc.getFieldValueUnrendered(xfield);

              try {

                var y = doc.getFieldValueUnrendered(yfield);
                  if(y != null) {

                      if(selectionActive) {
                          if(doc.isRecordSelected())
                              color  = doc.getFieldColor(yfield);
                          else
                              color = unselectedColor;
                      } else
                          color  = doc.getFieldColor(yfield);


                      var point = {x: x, y: y, record: doc, color: color};

                      if(sizeField)
                        point["size"] = doc.getFieldValueUnrendered(sizeField);

                      points.push(point);

                      if(fillEmptyValuesWith != null) {
                        uniqueX.push(x);
                      }
                  }

              }
              catch(err) {
                //console.log("Can't add field [" + field + "] to graph, filtered?")
              }
          });

           if(points.length>0)
            series.push({values: points, key: fieldLabel, color: yfield.getColorForPartition()});
       });

     } else throw "views.nvd3.graph.js: unsupported or not defined type " + seriesAttr.type;

      // foreach series fill empty values
      if(fillEmptyValuesWith != null) {
         uniqueX = _.unique(uniqueX);
          _.each(series, function(s) {
              // foreach series obtain the unique list of x
              var tmpValues = _.map(s.values, function(d) { return d.x});
              // foreach non present field set the value
              _.each(_.difference(uniqueX, tmpValues), function(diff) {
                  s.values.push({x: diff, y: fillEmptyValuesWith});
              });

          });
      }

      return series;
}


});



})(jQuery, recline.View);

