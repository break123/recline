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
        },

        render:function () {
            //console.log("View.xCharts: render");
            var self = this;

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
        },

        redraw:function () {
            var self = this;

            //console.log("View.xCharts: redraw");

            if (false/*self.graph*/)
                self.updateGraph();
            else
                self.renderGraph();

        },

        updateGraph:function () {
            //console.log("View.xCharts: updateGraph");
            var self = this;
            self.updateSeries();
            
            if (self.series.main && self.series.main.length && self.series.main[0].data && self.series.main[0].data.length)
        	{
            	self.graph.setData(self.series);
                this.el.find('div.xCharts-title-x').html(self.options.state.xAxisTitle)
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

        renderGraph:function () {
            //console.log("View.xCharts: renderGraph");
            this.el.find('figure').html("")
            var self = this;
            var state = self.options.state;
            self.updateSeries();

            if(state.legend)
                self.createLegend();

            if (self.series.main && self.series.main.length && self.series.main[0].data && self.series.main[0].data.length)
        	{
            	self.graph = new xChart(state.type, self.series, '#' + self.uid, state.opts);
            	if (state.interpolation)
            		self.graph._options.interpolation = state.interpolation
            		
                this.el.find('div.xCharts-title-x').html(self.options.state.xAxisTitle)

                // add Y-Axis title
                if (self.options.state.yAxisTitle)
            	{
                	var fullHeight = self.graph._height + self.graph._options.axisPaddingTop + self.graph._options.axisPaddingBottom
            	
	                self.graph._gScale.selectAll('g.axisY g.titleY').data([self.options.state.yAxisTitle]).enter()
	                	.append('g').attr('class', 'titleY').attr('transform', 'translate(-30,'+fullHeight/2+') rotate(-90)')
	                	.append('text').attr('x', -3).attr('y', 0).attr('dy', ".32em").attr('text-anchor', "middle").text(function(d) { return d; });
            	}
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
            var res = "";
            var i =0;
            _.each(self.series.main, function(d) {
                res +=("class='xchart color" +i+ "' " + d.name + "</br>");
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
})(jQuery, recline.View);