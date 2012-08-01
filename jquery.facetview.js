/*
 * jquery.facetview.js
 *
 * displays faceted browse results by querying a specified index
 * can read config locally or can be passed in as variable when executed
 * or a config variable can point to a remote config
 * config options include specifying SOLR or ElasticSearch index
 * 
 * created by Mark MacGillivray - mark@cottagelabs.com
 *
 * http://facetview.cottagelabs.com
 *
*/

// first define the bind with delay function from (saves loading it separately) 
// https://github.com/bgrins/bindWithDelay/blob/master/bindWithDelay.js
(function($) {
    $.fn.bindWithDelay = function( type, data, fn, timeout, throttle ) {
        var wait = null
        var that = this

        if ( $.isFunction( data ) ) {
            throttle = timeout
            timeout = fn
            fn = data
            data = undefined
        }

        function cb() {
            var e = $.extend(true, { }, arguments[0])
            var throttler = function() {
                wait = null
                fn.apply(that, [e])
            }

            if (!throttle) { clearTimeout(wait); }
            if (!throttle || !wait) { wait = setTimeout(throttler, timeout); }
        }

        return this.bind(type, data, cb)
    }
})(jQuery)

// add extension to jQuery with a function to get URL parameters
jQuery.extend({
    getUrlVars: function() {
        var params = new Object
        var hashes = window.location.href.slice(window.location.href.indexOf('?') + 1).split('&')
        for ( var i = 0; i < hashes.length; i++ ) {
            hash = hashes[i].split('=')
            if ( hash.length > 1 ) {
                if ( hash[1].replace(/%22/gi,"")[0] == "[" || hash[1].replace(/%22/gi,"")[0] == "{" ) {
                    hash[1] = hash[1].replace(/^%22/,"").replace(/%22$/,"")
                    var newval = JSON.parse(unescape(hash[1].replace(/%22/gi,'"')))
                } else {
                    var newval = unescape(hash[1].replace(/%22/gi,""))
                }
                params[hash[0]] = newval
            }
        }
        return params
    },
    getUrlVar: function(name){
        return jQuery.getUrlVars()[name]
    }
})


// now the facetview function
(function($){
    $.fn.facetview = function(options) {

        // a big default value (pulled into options below)
        var resdisplay = [
                [
                    {
                        "field": "author.name"
                    },
                    {
                        "pre": "(",
                        "field": "year",
                        "post": ")"
                    }
                ],
                [
                    {
                        "pre": "<strong>",
                        "field": "title",
                        "post": "</strong>"
                    }
                ],
                [
                    {
                        "field": "howpublished"
                    },
                    {
                        "pre": "in <em>",
                        "field": "journal.name",
                        "post": "</em>,"
                    },
                    {
                        "pre": "<em>",
                        "field": "booktitle",
                        "post": "</em>,"
                    },
                    {
                        "pre": "vol. ",
                        "field": "volume",
                        "post": ","
                    },
                    {
                        "pre": "p. ",
                        "field": "pages"
                    },
                    {
                        "field": "publisher"
                    }
                ],
                [
                    {
                        "field": "link.url"
                    }
                ]
            ]


        // specify the defaults
        var defaults = {
            "searchbox_class": ".facetview_freetext",// the class of the search boxes - only the value in the last found box will count
            "embedded_search": true,                // whether or not to put a search bar on the page (if not, another must be identified manually)
            "config_file": false,                   // a remote config file URL
            "facets":[],                            // facet objects: {"field":"blah", "display":"arg",...}
            "addremovefacets": false,               // false if no facets can be added at front end, otherwise list of facet names
            "result_display": resdisplay,           // display template for search results
            "display_images": true,                 // whether or not to display images found in links in search results
            "visualise_filters": true,              // whether or not to allow filter vis via d3
            "description":"",                       // a description of the current search to embed in the display
            "search_url":"",                        // the URL against which to submit searches
            "datatype":"jsonp",                     // the datatype for the search url - json for local, jsonp for remote
            "initialsearch":true,                   // whether or not to search on first load or not
            "search_index":"elasticsearch",         // elasticsearch or SOLR
            "default_url_params":{},                // any params that the search URL needs by default
            "freetext_submit_delay":"500",          // delay for auto-update of search results
            "query_parameter":"q",                  // the query parameter if required for setting to the search URL
            "q":"",                                 // default query value
            "predefined_filters":{},                // predefined filters to apply to all searches
            "paging":{
                "from":0,                           // where to start the results from
                "size":10                           // how many results to get
            },
            "searchwrap_start":'<table class="table table-striped" id="facetview_results">',                  // wrap the search result set in these tags
            "searchwrap_end":"</table>",            // wrap the search result set in these tags
            "resultwrap_start":"<tr><td>",          // wrap a given result in this
            "resultwrap_end":"</td></tr>",          // wrap a given result in this
            "result_box_colours":[],                // apply random bg color from the list to each .result_colour element
            "fadein":1000                           // fadein effect on results in ms   
        }


        // and add in any overrides from the call
        // these options are also overridable by URL parameters
        // facetview options are declared as a function so they are available externally
        // (see bottom of this file)
        var provided_options = $.extend(defaults, options)
        var url_options = $.getUrlVars()
        $.fn.facetview.options = $.extend(provided_options,url_options)
        var options = $.fn.facetview.options


        // ===============================================
        // functions to do with filters
        // ===============================================
        
        // show the filter values
        var showfiltervals = function(event) {
            event.preventDefault();
            if ( $(this).hasClass('facetview_open') ) {
                $(this).children('i').replaceWith('<i class="icon-plus"></i>')
                $(this).removeClass('facetview_open')
                $('#facetview_' + $(this).attr('rel') ).children().hide()
            } else {
                $(this).children('i').replaceWith('<i class="icon-minus"></i>')
                $(this).addClass('facetview_open')
                $('#facetview_' + $(this).attr('rel') ).children().show()
            }
        }

        // function to perform for sorting of filters
        var sortfilters = function(event) {
            event.preventDefault()
            var sortwhat = $(this).attr('href')
            var which = 0
            for (item in options.facets) {
                if ('field' in options.facets[item]) {
                    if ( options.facets[item]['field'] == sortwhat) {
                        which = item
                    }
                }
            }
            if ( $(this).hasClass('facetview_count') ) {
                options.facets[which]['order'] = 'count'
            } else if ( $(this).hasClass('facetview_term') ) {
                options.facets[which]['order'] = 'term'
            } else if ( $(this).hasClass('facetview_rcount') ) {
                options.facets[which]['order'] = 'reverse_count'
            } else if ( $(this).hasClass('facetview_rterm') ) {
                options.facets[which]['order'] = 'reverse_term'
            }
            dosearch()
            if ( !$(this).parent().parent().siblings('.facetview_filtershow').hasClass('facetview_open') ) {
                $(this).parent().parent().siblings('.facetview_filtershow').trigger('click')
            }
        }
        
        var renamefilter = function(event) {
            event.preventDefault()
            var renamewhat = $(this).attr('href')
            var which = 0
            for (item in options.facets) {
                if ('field' in options.facets[item]) {
                    if ( options.facets[item]['field'] == renamewhat) {
                        which = item
                    }
                }
            }
            var newname = prompt('What would you like to call this filter?')
            options.facets[which]['display'] = newname
            buildfilters()
            dosearch()
            if ( !$(this).parent().parent().siblings('.facetview_filtershow').hasClass('facetview_open') ) {
                $(this).parent().parent().siblings('.facetview_filtershow').trigger('click')
            }
        }

        // adjust how many results are shown
        var morefacetvals = function(event) {
            event.preventDefault()
            var morewhat = options.facets[ $(this).attr('rel') ]
            if ('size' in morewhat ) {
                var currentval = morewhat['size']
            } else {
                var currentval = 10
            }
            var newmore = prompt('Currently showing ' + currentval + 
                '. How many would you like instead?')
            if (newmore) {
                options.facets[ $(this).attr('rel') ]['size'] = parseInt(newmore)
                $(this).html('show up to (' + newmore + ')')
                dosearch()
                if ( !$(this).parent().parent().siblings('.facetview_filtershow').hasClass('facetview_open') ) {
                    $(this).parent().parent().siblings('.facetview_filtershow').trigger('click')
                }
            }
        }

        // insert a facet range once selected
        var dofacetrange = function(event) {
            event.preventDefault()
            var rel = $('#facetview_rangerel').html()
            var range = $('#facetview_rangechoices').html()
            var newobj = '<a class="facetview_filterselected facetview_facetrange facetview_clear ' + 
                'btn btn-info" rel="' + rel + 
                '" alt="remove" title="remove"' +
                ' href="' + $(this).attr("href") + '">' +
                range + ' <i class="icon-remove"></i></a>'
            $('#facetview_selectedfilters').append(newobj)
            $('.facetview_filterselected').unbind('click',clearfilter)
            $('.facetview_filterselected').bind('click',clearfilter)
            $('#facetview_rangemodal').modal('hide')
            $('#facetview_rangemodal').remove()
            options.paging.from = 0
            dosearch()
        }
        // remove the range modal from page altogether on close (rebuilt for each filter)
        var removerange = function(event) {
            event.preventDefault()
            $('#facetview_rangemodal').modal('hide')
            $('#facetview_rangemodal').remove()
        }
        // build a facet range selector
        var facetrange = function(event) {
            event.preventDefault()
            var modal = '<div class="modal" id="facetview_rangemodal"> \
                <div class="modal-header"> \
                <a class="facetview_removerange close">×</a> \
                <h3>Set a filter range</h3> \
                </div> \
                <div class="modal-body"> \
                <div style=" margin:20px;" id="facetview_slider"></div> \
                <h3 id="facetview_rangechoices" style="text-align:center; margin:10px;"> \
                <span class="facetview_lowrangeval">...</span> \
                <small>to</small> \
                <span class="facetview_highrangeval">...</span></h3> \
                <p>(NOTE: ranges must be selected based on the current content of \
                the filter. If you require more options than are currently available, \
                cancel and return to the filter options; select sort by term, and set \
                the number of values you require)</p> \
                </div> \
                <div class="modal-footer"> \
                <a id="facetview_dofacetrange" href="#" class="btn btn-primary">Apply</a> \
                <a class="facetview_removerange btn close">Cancel</a> \
                </div> \
                </div>';
            $('#facetview').append(modal)
            $('#facetview_rangemodal').append('<div id="facetview_rangerel" style="display:none;">' + $(this).attr('rel') + '</div>')
            $('#facetview_rangemodal').modal('show')
            $('#facetview_dofacetrange').bind('click',dofacetrange)
            $('.facetview_removerange').bind('click',removerange)
            var values = []
            var valsobj = $( '#facetview_' + $(this).attr('href').replace(/\./gi,'_') )
            valsobj.children('li').children('a').each(function() {
                values.push( $(this).attr('href') )
            })
            values = values.sort()
            $( "#facetview_slider" ).slider({
	            range: true,
	            min: 0,
	            max: values.length-1,
	            values: [0,values.length-1],
	            slide: function( event, ui ) {
		            $('#facetview_rangechoices .facetview_lowrangeval').html( values[ ui.values[0] ] )
		            $('#facetview_rangechoices .facetview_highrangeval').html( values[ ui.values[1] ] )
	            }
            })
            $('#facetview_rangechoices .facetview_lowrangeval').html( values[0] )
            $('#facetview_rangechoices .facetview_highrangeval').html( values[ values.length-1] )
        }


        // pass a list of filters to be displayed
        var buildfilters = function() {
            if ( options.facets.length > 0 ) {
                var filters = options.facets
                var thefilters = "<h3>Filter by</h3>"
                for ( var idx in filters ) {
                    var _filterTmpl = '<div id="facetview_filterbuttons" class="btn-group"> \
                        <a style="text-align:left; min-width:70%;" class="facetview_filtershow btn" \
                          rel="{{FILTER_NAME}}" href=""> \
                          <i class="icon-plus"></i> \
                          {{FILTER_DISPLAY}}</a> \
                          <a class="btn dropdown-toggle" data-toggle="dropdown" \
                          href="#"><span class="caret"></span></a> \
                          <ul class="dropdown-menu"> \
                            <li><a class="facetview_sort facetview_count" href="{{FILTER_EXACT}}">sort by count</a></li> \
                            <li><a class="facetview_sort facetview_term" href="{{FILTER_EXACT}}">sort by term</a></li> \
                            <li><a class="facetview_sort facetview_rcount" href="{{FILTER_EXACT}}">sort reverse count</a></li> \
                            <li><a class="facetview_sort facetview_rterm" href="{{FILTER_EXACT}}">sort reverse term</a></li> \
                            <li class="divider"></li> \
                            <li><a class="facetview_facetrange" rel="{{FACET_IDX}}" href="{{FILTER_EXACT}}">apply a filter range</a></li>{{FACET_VIS}} \
                            <li><a class="facetview_morefacetvals" rel="{{FACET_IDX}}" href="{{FILTER_EXACT}}">show up to ({{FILTER_HOWMANY}})</a></li> \
                            <li class="divider"></li> \
                            <li><a class="facetview_renamefilter" rel="{{FACET_IDX}}" href="{{FILTER_EXACT}}">rename this filter</a></li> \
                            </ul></div> \
                      <ul id="facetview_{{FILTER_NAME}}" \
                        class="facetview_filters"></ul>'
                    if (options.visualise_filters) {
                        var vis = '<li><a class="facetview_visualise" rel="{{FACET_IDX}}" href="{{FILTER_DISPLAY}}">visualise this filter</a></li>'
                        thefilters += _filterTmpl.replace(/{{FACET_VIS}}/g, vis)
                    } else {
                        thefilters += _filterTmpl.replace(/{{FACET_VIS}}/g, '')
                    }
                    thefilters = thefilters.replace(/{{FILTER_NAME}}/g, filters[idx]['field'].replace(/\./gi,'_')).replace(/{{FILTER_EXACT}}/g, filters[idx]['field']);
                    if ('size' in filters[idx] ) {
                        thefilters = thefilters.replace(/{{FILTER_HOWMANY}}/gi, filters[idx]['size'])
                    } else {
                        thefilters = thefilters.replace(/{{FILTER_HOWMANY}}/gi, 10)
                    }
                    thefilters = thefilters.replace(/{{FACET_IDX}}/gi,idx)
                    if ('display' in filters[idx]) {
                        thefilters = thefilters.replace(/{{FILTER_DISPLAY}}/g, filters[idx]['display'])
                    } else {
                        thefilters = thefilters.replace(/{{FILTER_DISPLAY}}/g, filters[idx]['field'])
                    }
                }
                $('#facetview_filters').html("").append(thefilters)
                options.visualise_filters ? $('.facetview_visualise').bind('click',show_vis) : ""
                $('.facetview_morefacetvals').bind('click',morefacetvals)
                $('.facetview_facetrange').bind('click',facetrange)
                $('.facetview_sort').bind('click',sortfilters)
                $('.facetview_renamefilter').bind('click',renamefilter)
                $('.facetview_filtershow').bind('click',showfiltervals)
                options.addremovefacets ? addremovefacets() : ""
                if (options.description) {
                    $('#facetview_filters').append('<div><h3>Meta</h3>' + options.description + '</div>')
                }
            }
        }

        // set the available filter values based on results
        var putvalsinfilters = function(data) {
            // for each filter setup, find the results for it and append them to the relevant filter
            for ( var each in options.facets ) {
                $('#facetview_' + options.facets[each]['field'].replace(/\./gi,'_')).children().remove()
                var records = data["facets"][ options.facets[each]['field'] ]
                for ( var item in records ) {
                    var append = '<li><a class="facetview_filterchoice' +
                        '" rel="' + options.facets[each]['field'] + '" href="' + item + '">' + item +
                        ' (' + records[item] + ')</a></li>'
                    $('#facetview_' + options.facets[each]['field'].replace(/\./gi,'_')).append(append)
                }
                if ( !$('.facetview_filtershow[rel="' + options.facets[each]['field'].replace(/\./gi,'_') + '"]').hasClass('facetview_open') ) {
                    $('#facetview_' + options.facets[each]['field'].replace(/\./gi,'_') ).children().hide()
                }
            }
            $('.facetview_filterchoice').bind('click',clickfilterchoice)
        }

        // show the add/remove filters options
        var addremovefacet = function(event) {
            event.preventDefault()
            if ( $(this).hasClass('facetview_filterexists') ) {
                $(this).removeClass('facetview_filterexists')
                delete options.facets[$(this).attr('href')]
            } else {
                $(this).addClass('facetview_filterexists')
                options.facets.push({'field':$(this).attr('title')})
            }
            buildfilters()
            dosearch()
        }
        var showarf = function(event) {
            event.preventDefault()
            $('#facetview_addremovefilters').toggle()
        }
        var addremovefacets = function() {
            $('#facetview_filters').append('<a id="facetview_showarf" href="">' + 
                'add or remove filters</a><div id="facetview_addremovefilters"></div>')
            for (var idx in options.facets) {
                if ( options.addremovefacets.indexOf(options.facets[idx].field) == -1 ) {
                    options.addremovefacets.push(options.facets[idx].field)
                }
            }
            for (var facet in options.addremovefacets) {
                var thisfacet = options.addremovefacets[facet]
                var filter = '<a class="btn '
                var index = 0
                var icon = '<i class="icon-plus"></i>' 
                for (var idx in options.facets) {
                    if ( options.facets[idx].field == thisfacet ) {
                        filter += 'btn-info facetview_filterexists'
                        index = idx
                        icon = '<i class="icon-remove icon-white"></i> '
                    }
                }
                filter += ' facetview_filterchoose" style="margin-top:5px;" href="' + index + '" title="' + thisfacet + '">' + icon + thisfacet + '</a><br />'
                $('#facetview_addremovefilters').append(filter)
            }
            $('#facetview_addremovefilters').hide()
            $('#facetview_showarf').bind('click',showarf)
            $('.facetview_filterchoose').bind('click',addremovefacet)
        }

        // ===============================================
        // functions to do with filter visualisations
        // ===============================================

        var show_vis = function(event) {
            event.preventDefault()
            if ($('#facetview_visualisation').length) {
                $('#facetview_visualisation').remove()
            } else {
                var vis = '<div id="facetview_visualisation"> \
                    <div class="modal-header"> \
                    <a class="facetview_removevis close">×</a> \
                    <h3>{{VIS_TITLE}}</h3> \
                    </div> \
                    <div class="modal-body"> \
                    </div> \
                    <div class="modal-footer"> \
                    <a class="facetview_removevis btn close">Close</a> \
                    </div> \
                    </div>'
                vis = vis.replace(/{{VIS_TITLE}}/gi,$(this).attr('href'))
                $('#facetview_rightcol').prepend(vis)
                $('.facetview_removevis').bind('click',show_vis)
                bubble($(this).attr('rel'),$('#facetview_rightcol').css('width').replace(/px/,'')-20)
            }
        }

        var bubble = function(facetidx,width) {
            var facetkey = options.facets[facetidx]['field']
            var facets = options.data.facets[facetkey]
            data = {"children":[]}
            var count = 0
            for (var fct in facets) {
                var arr = {
                    "className": fct,
                    "packageName": count++,
                    "value": facets[fct]
                }
                data["children"].push(arr)
            }
            var r = width,
                format = d3.format(",d"),
                fill = d3.scale.category20c()
            var bubble = d3.layout.pack()
                .sort(null)
                .size([r, r])
            var vis = d3.select("#facetview_visualisation > .modal-body").append("svg:svg")
                .attr("width", r)
                .attr("height", r)
                .attr("class", "bubble")
            var node = vis.selectAll("g.node")
                .data(bubble(data)
                .filter(function(d) { return !d.children; }))
                .enter().append("svg:g")
                .attr("class", "node")
                .attr("transform", function(d) { return "translate(" + d.x + "," + d.y + ")"; })
            node.append("svg:title")
                .text(function(d) { return d.data.className + ": " + format(d.value); })
            node.append("svg:circle")
                .attr("r", function(d) { return d.r; })
                .style("fill", function(d) { return fill(d.data.packageName); })
            node.append("svg:text")
                .attr("text-anchor", "middle")
                .attr("dy", ".3em")
                .text(function(d) { return d.data.className.substr(0,10) + ".. (" + d.data.value + ")"; })
            node.on('click',function(d) {
                clickbubble(facetkey,d.data.className)
            })
        }

        var clickbubble = function(facetkey,facetvalue) {
            var newobj = '<a class="facetview_filterselected facetview_clear ' + 
                'btn btn-info" rel="' + facetkey + 
                '" alt="remove" title="remove"' +
                ' href="' + facetvalue + '">' +
                facetvalue + ' <i class="icon-remove"></i></a>'
            $('#facetview_selectedfilters').append(newobj)
            $('.facetview_filterselected').unbind('click',clearfilter)
            $('.facetview_filterselected').bind('click',clearfilter)
            options.paging.from = 0
            dosearch()
            $('#facetview_visualisation').remove()
        }
        
        // ===============================================
        // functions to do with building results
        // ===============================================

        // read the result object and return useful vals depending on if ES or SOLR
        // returns an object that contains things like ["data"] and ["facets"]
        var parseresults = function(dataobj) {
            var resultobj = new Object()
            resultobj["records"] = new Array();
            resultobj["start"] = ""
            resultobj["found"] = ""
            resultobj["facets"] = new Object();
            if ( options.search_index == "elasticsearch" ) {
                for (var item in dataobj.hits.hits) {
                    resultobj["records"].push(dataobj.hits.hits[item]._source)
                    resultobj["start"] = ""
                    resultobj["found"] = dataobj.hits.total
                }
                for (var item in dataobj.facets) {
                    var facetsobj = new Object()
                    for (var thing in dataobj.facets[item]["terms"]) {
                        facetsobj[ dataobj.facets[item]["terms"][thing]["term"] ] = dataobj.facets[item]["terms"][thing]["count"]
                    }
                    resultobj["facets"][item] = facetsobj
                }
            } else {
                resultobj["records"] = dataobj.response.docs
                resultobj["start"] = dataobj.response.start
                resultobj["found"] = dataobj.response.numFound
                if (dataobj.facet_counts) {
                  for (var item in dataobj.facet_counts.facet_fields) {
                      var facetsobj = new Object();
                      var count = 0
                      for ( var each in dataobj.facet_counts.facet_fields[item]) {
                          if ( count % 2 == 0 ) {
                              facetsobj[ dataobj.facet_counts.facet_fields[item][each] ] = dataobj.facet_counts.facet_fields[item][count + 1]
                          }
                          count += 1
                      }
                      resultobj["facets"][item] = facetsobj
                  }
              }
            }
            return resultobj
        }

        // decrement result set
        var decrement = function(event) {
            event.preventDefault()
            if ( $(this).html() != '..' ) {
                options.paging.from = options.paging.from - options.paging.size
                options.paging.from < 0 ? options.paging.from = 0 : ""
                dosearch()
            }
        }

        // increment result set
        var increment = function(event) {
            event.preventDefault()
            if ( $(this).html() != '..' ) {
                options.paging.from = parseInt($(this).attr('href'))
                dosearch()
            }
        }

        // write the metadata to the page
        var putmetadata = function(data) {
            if ( typeof(options.paging.from) != 'number' ) {
                options.paging.from = parseInt(options.paging.from)
            }
            if ( typeof(options.paging.size) != 'number' ) {
                options.paging.size = parseInt(options.paging.size)
            }
            var metaTmpl = '<div class="pagination"> \
                <ul> \
                  <li class="prev"><a id="facetview_decrement" href="{{from}}">&laquo; back</a></li> \
                  <li class="active"><a>{{from}} &ndash; {{to}} of {{total}}</a></li> \
                  <li class="next"><a id="facetview_increment" href="{{to}}">next &raquo;</a></li> \
                </ul> \
              </div>'
            $('#facetview_metadata').html("Not found...")
            if (data.found) {
                var from = options.paging.from + 1
                var size = options.paging.size
                !size ? size = 10 : ""
                var to = options.paging.from+size
                data.found < to ? to = data.found : ""
                var meta = metaTmpl.replace(/{{from}}/g, from)
                meta = meta.replace(/{{to}}/g, to)
                meta = meta.replace(/{{total}}/g, data.found)
                $('#facetview_metadata').html("").append(meta)
                $('#facetview_decrement').bind('click',decrement)
                from < size ? $('#facetview_decrement').html('..') : ""
                $('#facetview_increment').bind('click',increment)
                data.found <= to ? $('#facetview_increment').html('..') : ""
            }
        }

        // given a result record, build how it should look on the page
        var buildrecord = function(index) {
            var record = options.data['records'][index]
            var result = options.resultwrap_start
            // add first image where available
            if (options.display_images) {
                var recstr = JSON.stringify(record)
                var regex = /(http:\/\/\S+?\.(jpg|png|gif|jpeg))/
                var img = regex.exec(recstr)
                if (img) {
                    result += '<img class="thumbnail" style="float:left; width:100px; margin:0 5px 10px 0; max-height:150px;" src="' + img[0] + '" />'
                }
            }
            // add the record based on display template if available
            var display = options.result_display
            var lines = ''
            for (var lineitem in display) {
                line = ""
                for (object in display[lineitem]) {
                    var thekey = display[lineitem][object]['field']
                    parts = thekey.split('.')
                    // TODO: this should perhaps recurse..
                    if (parts.length == 1) {
                        var res = record
                    } else if (parts.length == 2) {
                        var res = record[parts[0]]
                    } else if (parts.length == 3) {
                        var res = record[parts[0]][parts[1]]
                    }
                    var counter = parts.length - 1
                    if (res && res.constructor.toString().indexOf("Array") == -1) {
                        var thevalue = res[parts[counter]]  // if this is a dict
                    } else {
                        var thevalue = []
                        for (var row in res) {
                            thevalue.push(res[row][parts[counter]])
                        }
                    }
                    if (thevalue && thevalue.length) {
                        display[lineitem][object]['pre'] 
                            ? line += display[lineitem][object]['pre'] : false
                        if ( typeof(thevalue) == 'object' ) {
                            for (var val in thevalue) {
                                val != 0 ? line += ', ' : false
                                line += thevalue[val]
                            }
                        } else {
                            line += thevalue
                        }
                        display[lineitem][object]['post'] 
                            ? line += display[lineitem][object]['post'] : line += ' '
                    }
                }
                if (line) {
                    lines += line.replace(/^\s/,'').replace(/\s$/,'').replace(/\,$/,'') + "<br />"
                }
            }
            lines ? result += lines : result += JSON.stringify(record,"","    ")
            result += options.resultwrap_end
            return result
        }

        // view a full record when selected
        var viewrecord = function(event) {
            event.preventDefault()
            var record = options.data['records'][$(this).attr('href')]
            alert(JSON.stringify(record,"","    "))
            
        }

        // put the results on the page
        showresults = function(sdata) {
            // get the data and parse from the solr / es layout
            var data = parseresults(sdata)
            options.data = data
            // change filter options
            putvalsinfilters(data)
            // put result metadata on the page
            putmetadata(data)
            // put the filtered results on the page
            $('#facetview_results').html("")
            var infofiltervals = new Array()
            $.each(data.records, function(index, value) {
                // write them out to the results div
                $('#facetview_results').append( buildrecord(index) )
                $('#facetview_results tr:last-child').linkify()
            });
            if ( options.result_box_colours.length > 0 ) {
                jQuery('.result_box').each(function () {
                    var colour = options.result_box_colours[Math.floor(Math.random()*options.result_box_colours.length)] 
                jQuery(this).css("background-color", colour)
                })                
            }
            $('#facetview_results').children().hide().fadeIn(options.fadein)
            $('.facetview_viewrecord').bind('click',viewrecord)
            jQuery('.notify_loading').hide()
        }

        // ===============================================
        // functions to do with searching
        // ===============================================

        // build the search query URL based on current params
        var solrsearchquery = function() {
            // set default URL params
            var urlparams = ""
            for (var item in options.default_url_params) {
                urlparams += item + "=" + options.default_url_params[item] + "&"
            }
            // do paging params
            var pageparams = ""
            for (var item in options.paging) {
                pageparams += item + "=" + options.paging[item] + "&"
            }
            // set facet params
            var urlfilters = "";
            for (var item in options.facets) {
                urlfilters += "facet.field=" + options.facets[item]['field'] + "&"
            }
            // build starting URL
            var theurl = options.search_url + urlparams + pageparams + urlfilters + options.query_parameter + "="
            // add default query values
            // build the query, starting with default values
            var query = ""
            for (var item in options.predefined_filters) {
                query += item + ":" + options.predefined_filters[item] + " AND "
            }
            $('.facetview_filterselected',obj).each(function() {
                query += $(this).attr('rel') + ':"' + 
                    $(this).attr('href') + '" AND '
            });
            // add any freetext filter
            if (options.q != "") {
                query += options.q + '*'
            }
            query = query.replace(/ AND $/,"")
            // set a default for blank search
            if (query == "") {
                query = "*:*"
            }
            theurl += query
            return theurl
        }

        // build the search query URL based on current params
        var elasticsearchquery = function() {
            var qs = {}
            var bool = false
            $('.facetview_filterselected',obj).each(function() {
                !bool ? bool = {'must': [] } : ""
                if ( $(this).hasClass('facetview_facetrange') ) {
                    var rel = options.facets[ $(this).attr('rel') ]['field']
                    var rngs = {
                        'from': $('.facetview_lowrangeval', this).html(),
                        'to': $('.facetview_highrangeval', this).html()
                    }
                    var obj = {'range': {}}
                    obj['range'][ rel ] = rngs
                    bool['must'].push(obj)
                } else {
                    var obj = {'term':{}}
                    obj['term'][ $(this).attr('rel') ] = $(this).attr('href')
                    bool['must'].push(obj)
                }
            });
            for (var item in options.predefined_filters) {
                !bool ? bool = {'must': [] } : ""
                var obj = {'term': {}}
                obj['term'][ item ] = options.predefined_filters[item]
                bool['must'].push(obj)
            }
            if (bool) {
                options.q != ""
                    ? bool['must'].push( {'query_string': { 'query': options.q } } )
                    : ""
                qs['query'] = {'bool': bool}
            } else {
                options.q != ""
                    ? qs['query'] = {'query_string': { 'query': options.q } }
                    : qs['query'] = {'match_all': {}}
            }
            // set any paging
            options.paging.from != 0 ? qs['from'] = options.paging.from : ""
            options.paging.size != 10 ? qs['size'] = options.paging.size : ""
            // set any facets
            qs['facets'] = {}
            for (var item in options.facets) {
                var obj = jQuery.extend(true, {}, options.facets[item] )
                delete obj['display']
                qs['facets'][obj['field']] = {"terms":obj}
            }
            return JSON.stringify(qs)
        }

        // execute a search
        var dosearch = function() {
            jQuery('.notify_loading').show()
            // update the options with the latest q value
            // TODO: should add a check and perhaps a clear of other searchboxes
            $(options.searchbox_class).each(function() {
                $(this).val().length != 0 ? options.q = $(this).val() : ""
            })
            // make the search query
            if ( options.search_index == "elasticsearch" ) {
              $.ajax({
                type: "get",
                url: options.search_url,
                data: {source: elasticsearchquery()},
                // processData: false,
                dataType: options.datatype,
                success: showresults
              })
            } else {
                $.ajax( { type: "get", url: solrsearchquery(), dataType:options.datatype, jsonp:"json.wrf", success: function(data) { showresults(data) } } )
            }
        }

        // trigger a search when a filter choice is clicked
        var clickfilterchoice = function(event) {
            event.preventDefault()
            var newobj = '<a class="facetview_filterselected facetview_clear ' + 
                'btn btn-info" rel="' + $(this).attr("rel") + 
                '" alt="remove" title="remove"' +
                ' href="' + $(this).attr("href") + '">' +
                $(this).html().replace(/\(.*\)/,'') + ' <i class="icon-remove"></i></a>'
            $('#facetview_selectedfilters').append(newobj)
            $('.facetview_filterselected').unbind('click',clearfilter)
            $('.facetview_filterselected').bind('click',clearfilter)
            options.paging.from = 0
            dosearch()
        }

        // clear a filter when clear button is pressed, and re-do the search
        var clearfilter = function(event) {
            event.preventDefault()
            $(this).remove()
            dosearch()
        }

        // do search options
        var fixmatch = function(event) {
            event.preventDefault()
            var fixtype = $(this).attr('id')
            $(options.searchbox_class).each(function() {
                if ( fixtype == "facetview_partial_match" && $(this).val().length != 0 ) {
                    var newvals = $(this).val().replace(/"/gi,'').replace(/\*/gi,'').replace(/\~/gi,'').split(' ')
                    var newstring = ""
                    for (item in newvals) {
                        if (newvals[item].length > 0 && newvals[item] != ' ') {
                            if (newvals[item] == 'OR' || newvals[item] == 'AND') {
                                newstring += newvals[item] + ' '
                            } else {
                                newstring += '*' + newvals[item] + '* '
                            }
                        }
                    }
                    $(this).val(newstring)
                    $(this).focus().trigger('keyup')
                } else if ( fixtype == "facetview_fuzzy_match" && $(this).val().length != 0 ) {
                    var newvals = $(this).val().replace(/"/gi,'').replace(/\*/gi,'').replace(/\~/gi,'').split(' ');
                    var newstring = ""
                    for (item in newvals) {
                        if (newvals[item].length > 0 && newvals[item] != ' ') {
                            if (newvals[item] == 'OR' || newvals[item] == 'AND') {
                                newstring += newvals[item] + ' '
                            } else {
                                newstring += newvals[item] + '~ '
                            }
                        }
                    }
                    $(this).val(newstring);
                    $(this).focus().trigger('keyup')
                } else if ( fixtype == "facetview_exact_match" && $(this).val().length != 0 ) {
                    var newvals = $(this).val().replace(/"/gi,'').replace(/\*/gi,'').replace(/\~/gi,'').split(' ');
                    var newstring = "";
                    for (item in newvals) {
                        if (newvals[item].length > 0 && newvals[item] != ' ') {
                            if (newvals[item] == 'OR' || newvals[item] == 'AND') {
                                newstring += newvals[item] + ' '
                            } else {
                                newstring += '"' + newvals[item] + '" '
                            }
                        }
                    }
                    $.trim(newstring,' ');
                    $(this).val(newstring);
                    $(this).focus().trigger('keyup')
                } else if ( fixtype == "facetview_match_all" && $(this).val().length != 0 ) {
                    $(this).val($.trim($(this).val().replace(/ OR /gi,' ')))
                    $(this).val($(this).val().replace(/ /gi,' AND '))
                    $(this).focus().trigger('keyup')
                } else if ( fixtype == "facetview_match_any" && $(this).val().length != 0 ) {
                    $(this).val($.trim($(this).val().replace(/ AND /gi,' ')))
                    $(this).val($(this).val().replace(/ /gi,' OR '))
                    $(this).focus().trigger('keyup')
                }
            })
        }


        // adjust how many results are shown
        var howmany = function(event) {
            event.preventDefault()
            var newhowmany = prompt('Currently displaying ' + options.paging.size + 
                ' results per page. How many would you like instead?')
            if (newhowmany) {
                options.paging.size = parseInt(newhowmany)
                options.paging.from = 0
                $('#facetview_howmany').html('results per page (' + options.paging.size + ')')
                dosearch()
            }
        }

        // the facet view object to be appended to the page
        var thefacetview = '<div id="facetview"><div class="row-fluid">'
        if ( options.facets.length > 0 ) {
            thefacetview += '<div class="span3"><div id="facetview_filters"></div></div>'
            thefacetview += '<div class="span9" id="facetview_rightcol">'
        } else {
            thefacetview += '<div class="span12" id="facetview_rightcol">'
        }
        if ( options.embedded_search == true ) {
            thefacetview += '<div id="facetview_searchbar" style="display:inline; float:left;" class="input-prepend"> \
               <span class="add-on"><i class="icon-search"></i></span> \
               <input class="facetview_freetext span4" name="q" value="" placeholder="search term" autofocus /> \
               </div> \
               <div style="display:inline; float:left;margin-left:-2px;" class="btn-group"> \
                <a style="-moz-border-radius:0px 3px 3px 0px; \
                -webkit-border-radius:0px 3px 3px 0px; border-radius:0px 3px 3px 0px;" \
                class="btn dropdown-toggle" data-toggle="dropdown" href="#"> \
                <i class="icon-cog"></i> <span class="caret"></span></a> \
                <ul style="margin-left:-110px;" class="dropdown-menu"> \
                <li><a id="facetview_partial_match" href="">partial match</a></li> \
                <li><a id="facetview_exact_match" href="">exact match</a></li> \
                <li><a id="facetview_fuzzy_match" href="">fuzzy match</a></li> \
                <li><a id="facetview_match_all" href="">match all</a></li> \
                <li><a id="facetview_match_any" href="">match any</a></li> \
                <li><a href="#">clear all</a></li> \
                <li class="divider"></li> \
                <li><a target="_blank" \
                href="http://lucene.apache.org/java/2_9_1/queryparsersyntax.html"> \
                learn more</a></li> \
                <li class="divider"></li> \
                <li><a id="facetview_howmany" href="#">results per page ({{HOW_MANY}})</a></li> \
                </ul> \
               </div> \
            '
        }
        thefacetview += '<div style="clear:both;" id="facetview_selectedfilters"></div>'
        thefacetview += options.searchwrap_start + options.searchwrap_end
        thefacetview += '<div id="facetview_metadata"></div></div></div></div>'

        // what to do when ready to go
        var whenready = function() {
            // append the facetview object to this object
            thefacetview = thefacetview.replace(/{{HOW_MANY}}/gi,options.paging.size)
            $(obj).append(thefacetview)

            if ( options.embedded_search == true ) {
                // setup search option triggers
                $('#facetview_partial_match').bind('click',fixmatch)
                $('#facetview_exact_match').bind('click',fixmatch)
                $('#facetview_fuzzy_match').bind('click',fixmatch)
                $('#facetview_match_any').bind('click',fixmatch)
                $('#facetview_match_all').bind('click',fixmatch)
                $('#facetview_howmany').bind('click',howmany)
                // resize the searchbar
                var thewidth = $('#facetview_searchbar').parent().width()
                $('#facetview_searchbar').css('width',thewidth - 50 + 'px')
                $(options.searchbox_class).css('width', thewidth - 88 + 'px')
            }


            // check paging info is available
            !options.paging.size ? options.paging.size = 10 : ""
            !options.paging.from ? options.paging.from = 0 : ""

            // set any default search values into the last search bar
            var allempty = true
            $(options.searchbox_class).each(function() {
                $(this).val().length != 0 ? allempty = false : ""
            })
            allempty && options.q != "" ? $(options.searchbox_class).last().val(options.q) : ""

            // append the filters to the facetview object
            buildfilters()
            $(options.searchbox_class).bindWithDelay('keyup',dosearch,options.freetext_submit_delay)

            // trigger the search once on load, to get all results
            options.initialsearch ? dosearch() : ""
        }

        // ===============================================
        // now create the plugin on the page
        return this.each(function() {
            // get this object
            obj = $(this)
            
            // check for remote config options, then do first search
            if (options.config_file) {
                $.ajax({
                    type: "get",
                    url: options.config_file,
                    dataType: "jsonp",
                    success: function(data) {
                        options = $.extend(options, data)
                        whenready()
                    },
                    error: function() {
                        $.ajax({
                            type: "get",
                            url: options.config_file,
                            success: function(data) {
                                options = $.extend(options, $.parseJSON(data))
                                whenready()
                            },
                            error: function() {
                                whenready()
                            }
                        })
                    }
                })
            } else {
                whenready()
            }

        }) // end of the function  

    }

    // facetview options are declared as a function so that they can be retrieved
    // externally (which allows for saving them remotely etc)
    $.fn.facetview.options = {}

})(jQuery)
