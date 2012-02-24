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
    var wait = null;
    var that = this;

    if ( $.isFunction( data ) ) {
        throttle = timeout;
        timeout = fn;
        fn = data;
        data = undefined;
    }

    function cb() {
        var e = $.extend(true, { }, arguments[0]);
        var throttler = function() {
            wait = null;
            fn.apply(that, [e]);
            };

            if (!throttle) { clearTimeout(wait); }
            if (!throttle || !wait) { wait = setTimeout(throttler, timeout); }
        }

        return this.bind(type, data, cb);
    }
})(jQuery);


// now the facetview function
(function($){
    $.fn.facetview = function(options) {

        // some big default values
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
            "config_file":false,
            "facets":[],
            "result_display": resdisplay,
            "ignore_fields":["_id","_rev"],
            "description":"",
            "search_url":"",
            "search_index":"elasticsearch",
            "default_url_params":{},
            "freetext_submit_delay":"700",
            "query_parameter":"q",
            "q":"*:*",
            "predefined_filters":{},
            "paging":{}
        };

        // and add in any overrides from the call
        var options = $.extend(defaults, options);
        !options.paging.size ? options.paging.size = 10 : ""
        !options.paging.from ? options.paging.from = 0 : ""

        // ===============================================
        // functions to do with filters
        // ===============================================
        
        // show the filter values
        var showfiltervals = function(event) {
            event.preventDefault();
            if ( $(this).hasClass('facetview_open') ) {
                $(this).children('i').replaceWith('<i class="icon-plus"></i>')
                $(this).removeClass('facetview_open');
                $('#facetview_' + $(this).attr('rel') ).children().hide();
            } else {
                $(this).children('i').replaceWith('<i class="icon-minus"></i>')
                $(this).addClass('facetview_open');
                $('#facetview_' + $(this).attr('rel') ).children().show();      
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
                $(this).html('show up to ' + newmore )
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
                range + ' <i class="icon-remove"></i></a>';
            $('#facetview_selectedfilters').append(newobj);
            $('.facetview_filterselected').unbind('click',clearfilter);
            $('.facetview_filterselected').bind('click',clearfilter);
            $('#facetview_rangemodal').modal('hide')
            $('#facetview_rangemodal').remove()
            options.paging.from = 0
            dosearch();
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
            var filters = options.facets;
            var thefilters = "<h3>Filter by</h3>";
            for ( var idx in filters ) {
                var _filterTmpl = ' \
                    <div class="btn-group"> \
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
                        <li><a class="facetview_facetrange" rel="{{FACET_IDX}}" href="{{FILTER_EXACT}}">select a filter range</a></li> \
                        <li class="divider"></li> \
                        <li><a class="facetview_morefacetvals" rel="{{FACET_IDX}}" href="{{FILTER_EXACT}}">show up to {{FILTER_HOWMANY}}</a></li> \
                        </ul></div> \
                  <ul id="facetview_{{FILTER_NAME}}" \
                    class="facetview_filters"></ul> \
                    ';
                thefilters += _filterTmpl.replace(/{{FILTER_NAME}}/g, filters[idx]['field'].replace(/\./gi,'_')).replace(/{{FILTER_EXACT}}/g, filters[idx]['field']);
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
            $('#facetview_filters').append(thefilters)
            $('.facetview_morefacetvals').bind('click',morefacetvals)
            $('.facetview_facetrange').bind('click',facetrange)
            $('.facetview_sort').bind('click',sortfilters)
            $('.facetview_filtershow').bind('click',showfiltervals)
        }

        // set the available filter values based on results
        var putvalsinfilters = function(data) {
            // for each filter setup, find the results for it and append them to the relevant filter
            for ( var each in options.facets ) {
                $('#facetview_' + options.facets[each]['field'].replace(/\./gi,'_')).children().remove();
                var records = data["facets"][ options.facets[each]['field'] ];
                for ( var item in records ) {
                    var append = '<li><a class="facetview_filterchoice' +
                        '" rel="' + options.facets[each]['field'] + '" href="' + item + '">' + item +
                        ' (' + records[item] + ')</a></li>';
                    $('#facetview_' + options.facets[each]['field'].replace(/\./gi,'_')).append(append);
                }
                if ( !$('.facetview_filtershow[rel="' + options.facets[each]['field'].replace(/\./gi,'_') + '"]').hasClass('facetview_open') ) {
                    $('#facetview_' + options.facets[each]['field'].replace(/\./gi,'_') ).children().hide();
                }
            }
            $('.facetview_filterchoice').bind('click',clickfilterchoice);
        }

        // ===============================================
        // functions to do with filter options
        // ===============================================

        // show the advanced functions
        var showadvanced = function(event) {
            event.preventDefault();
            if ( $(this).hasClass('facetview_open') ) {
                $(this).removeClass('facetview_open').siblings().hide();
            } else {
                $(this).addClass('facetview_open').siblings().show();
            }
        }

        // add a filter when a new one is provided
        var addfilters = function() {
            options.facets.push({'field':$(this).val()});
            // remove any current filters
            $('#facetview_filters').html("");
            buildfilters();
            dosearch();
        }

        // set the user admin filters
        var advanced = function() {
            var advanceddiv = '<div id="facetview_advanced">' + 
                '<a class="facetview_advancedshow" href="">ADVANCED ...</a>' +
                '<p>add filter:<br /><select id="facetview_addfilters"></select></p></div>';
            $('#facetview_filters').after(advanceddiv);
            $('.facetview_advancedshow').bind('click',showadvanced).siblings().hide();
        }
        
        // populate the advanced options
        var populateadvanced = function(data) {
            // iterate through source keys
            var options = "";
            for (var item in data["records"][0]) {
                options += '<option>' + item + '</option>';
            }
            $('#facetview_addfilters').html("");
            $('#facetview_addfilters').append(options);
            $('#facetview_addfilters').change(addfilters);
        
        }
        
        // ===============================================
        // functions to do with building results
        // ===============================================

        // read the result object and return useful vals depending on if ES or SOLR
        // returns an object that contains things like ["data"] and ["facets"]
        var parseresults = function(dataobj) {
            var resultobj = new Object();
            resultobj["records"] = new Array();
            resultobj["start"] = "";
            resultobj["found"] = "";
            resultobj["facets"] = new Object();
            if ( options.search_index == "elasticsearch" ) {
                for (var item in dataobj.hits.hits) {
                    resultobj["records"].push(dataobj.hits.hits[item]._source);
                    resultobj["start"] = "";
                    resultobj["found"] = dataobj.hits.total;
                }
                for (var item in dataobj.facets) {
                    var facetsobj = new Object();
                    for (var thing in dataobj.facets[item]["terms"]) {
                        facetsobj[ dataobj.facets[item]["terms"][thing]["term"] ] = dataobj.facets[item]["terms"][thing]["count"];
                    }
                    resultobj["facets"][item] = facetsobj;
                }
            } else if ( options.search_index == "bibserver" ) {
            } else {
                resultobj["records"] = dataobj.response.docs;
                resultobj["start"] = dataobj.response.start;
                resultobj["found"] = dataobj.response.numFound;
                if (dataobj.facet_counts) {
                  for (var item in dataobj.facet_counts.facet_fields) {
                      var facetsobj = new Object();
                      var count = 0;
                      for ( var each in dataobj.facet_counts.facet_fields[item]) {
                          if ( count % 2 == 0 ) {
                              facetsobj[ dataobj.facet_counts.facet_fields[item][each] ] = dataobj.facet_counts.facet_fields[item][count + 1];
                          }
                          count += 1;
                      }
                      resultobj["facets"][item] = facetsobj;
                  }
              }
            }
            return resultobj;
        }

        // decrement result set
        var decrement = function(event) {
            event.preventDefault()
            if ( $(this).html() != '..' ) {
                options.paging.from = options.paging.from - options.paging.size
                options.paging.from < 0 ? options.paging.from = 0 : ""
                dosearch();
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
            var metaTmpl = ' \
              <div class="pagination"> \
                <ul> \
                  <li class="prev"><a id="facetview_decrement" href="{{from}}">&laquo; back</a></li> \
                  <li class="active"><a>{{from}} &ndash; {{to}} of {{total}}</a></li> \
                  <li class="next"><a id="facetview_increment" href="{{to}}">next &raquo;</a></li> \
                </ul> \
              </div> \
              ';
            $('#facetview_metadata').html("Not found...")
            if (data.found) {
                var from = options.paging.from + 1
                var size = options.paging.size
                !size ? size = 10 : ""
                var to = options.paging.from+size
                data.found < to ? to = data.found : ""
                var meta = metaTmpl.replace(/{{from}}/g, from);
                meta = meta.replace(/{{to}}/g, to);
                meta = meta.replace(/{{total}}/g, data.found);
                $('#facetview_metadata').html("").append(meta);
                $('#facetview_decrement').bind('click',decrement)
                from < size ? $('#facetview_decrement').html('..') : ""
                $('#facetview_increment').bind('click',increment)
                data.found <= to ? $('#facetview_increment').html('..') : ""
            }

        }

        // given a result record, build how it should look on the page
        var buildrecord = function(record) {
            var result = '<tr><td>';
            result +=  ' \
            <div style="float:right;" class="btn-group"> \
                <a style="margin-left:10px;" class="btn dropdown-toggle" data-toggle="dropdown" href="#"> \
                <i class="icon-cog"></i> <span class="caret"></span></a> \
                <ul class="dropdown-menu"> \
                <li><a href="">no options yet...</a></li> \
                </ul> \
               </div>';
            var display = options.result_display
            var lines = ''
            for (lineitem in display) {
                line = ""
                for (object in display[lineitem]) {
                    var thekey = display[lineitem][object]['field']
                    parts = thekey.split('.')
                    // TODO: this should perhaps recurse..
                    if (parts.length == 1) {
                        var res = record
                    } else if (parts.length == 2) {
                        var res = record[parts[0]]
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
                            ? line += display[lineitem][object]['post'] : false
                        line += ' '
                    }
                }
                if (line) {
                    lines += line.replace(/^\s/,'').replace(/\s$/,'').replace(/\,$/,'') + "<br />"
                }
            }
            lines ? result += lines : result += 'unidentified item'
            result += '</td></tr>'
            return result;
        }

        // put the results on the page
        showresults = function(sdata) {
            // get the data and parse from the solr / es layout
            var data = parseresults(sdata);
            // change filter options
            putvalsinfilters(data);
            // put result metadata on the page
            putmetadata(data);
            // populate the advanced options
            populateadvanced(data);
            // put the filtered results on the page
            $('#facetview_results').html("");
            var infofiltervals = new Array();
            $.each(data.records, function(index, value) {
                // write them out to the results div
                $('#facetview_results').append( buildrecord(value) );
                $('#facetview_results tr:last-child').linkify()
            });
            // bind the more action to show the hidden details
            $('.facetview_more').bind('click',showmore);
        }

        // show more details of an event, and trigger the book search
        var showmore = function(event) {
            event.preventDefault();
            alert("show record view options")
        }

        // ===============================================
        // functions to do with searching
        // ===============================================

        // build the search query URL based on current params
        var solrsearchquery = function() {
            // set default URL params
            var urlparams = "";
            for (var item in options.default_url_params) {
                urlparams += item + "=" + options.default_url_params[item] + "&";
            }
            // do paging params
            var pageparams = "";
            for (var item in options.paging) {
                pageparams += item + "=" + options.paging[item] + "&";
            }
            // set facet params
            var urlfilters = "";
            for (var item in options.facets) {
                urlfilters += "facet.field=" + options.facets[item]['field'] + "&";
            }
            // build starting URL
            var theurl = options.search_url + urlparams + pageparams + urlfilters + options.query_parameter + "=";
            // add default query values
            // build the query, starting with default values
            var query = "";
            for (var item in options.predefined_filters) {
                query += item + ":" + options.predefined_filters[item] + " AND ";
            }
            $('.facetview_filterselected',obj).each(function() {
                query += $(this).attr('rel') + ':"' + 
                    $(this).attr('href') + '" AND ';
            });
            // add any freetext filter
            if ($('#facetview_freetext').val() != "") {
                query += $('#facetview_freetext').val() + '*';
            }
            query = query.replace(/ AND $/,"");
            // set a default for blank search
            if (query == "") {
                query = options.q;
            }
            theurl += query;
            return theurl;
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
                $('#facetview_freetext').val() != ""
                    ? bool['must'].push( {'query_string': { 'query': $('#facetview_freetext').val() } } )
                    : ""
                qs['query'] = {'bool': bool}
            } else {
                $('#facetview_freetext').val() != ""
                    ? qs['query'] = {'query_string': { 'query': $('#facetview_freetext').val() } }
                    : qs['query'] = {'match_all': {}}
            }
            // set any paging
            options.paging.from != 0 ? qs['from'] = options.paging.from : ""
            options.paging.size != 10 ? qs['size'] = options.paging.size : ""
            // set any facets
            qs['facets'] = {};
            for (var item in options.facets) {
                var obj = options.facets[item]
                delete obj['display']
                qs['facets'][obj['field']] = {"terms":obj}
            }
            return JSON.stringify(qs)
        }

        // execute a search
        var dosearch = function() {
            if ( options.search_index == "elasticsearch" ) {
              $.ajax({
                type: "get",
                url: options.search_url,
                data: {source: elasticsearchquery()},
                // processData: false,
                dataType: "jsonp",
                success: showresults
              });
            } else {
                $.ajax( { type: "get", url: solrsearchquery(), dataType:"jsonp", jsonp:"json.wrf", success: function(data) { showresults(data) } } );
            }
        }

        // trigger a search when a filter choice is clicked
        var clickfilterchoice = function(event) {
            event.preventDefault();
            var newobj = '<a class="facetview_filterselected facetview_clear ' + 
                'btn btn-info" rel="' + $(this).attr("rel") + 
                '" alt="remove" title="remove"' +
                ' href="' + $(this).attr("href") + '">' +
                $(this).html().replace(/\(.*\)/,'') + ' <i class="icon-remove"></i></a>';
            $('#facetview_selectedfilters').append(newobj);
            $('.facetview_filterselected').unbind('click',clearfilter);
            $('.facetview_filterselected').bind('click',clearfilter);
            options.paging.from = 0
            dosearch();
        }

        // clear a filter when clear button is pressed, and re-do the search
        var clearfilter = function(event) {
            event.preventDefault();
            $(this).remove();
            dosearch();
        }

        // do search options
        var fixmatch = function(event) {
            event.preventDefault();
            if ( $(this).attr('id') == "facetview_partial_match" ) {
                var newvals = $('#facetview_freetext').val().replace(/"/gi,'').replace(/\*/gi,'').replace(/\~/gi,'').split(' ');
                var newstring = "";
                for (item in newvals) {
                    if (newvals[item].length > 0 && newvals[item] != ' ') {
                        if (newvals[item] == 'OR' || newvals[item] == 'AND') {
                            newstring += newvals[item] + ' ';
                        } else {
                            newstring += '*' + newvals[item] + '* ';
                        }
                    }
                }
                $('#facetview_freetext').val(newstring);
            } else if ( $(this).attr('id') == "facetview_fuzzy_match" ) {
                var newvals = $('#facetview_freetext').val().replace(/"/gi,'').replace(/\*/gi,'').replace(/\~/gi,'').split(' ');
                var newstring = "";
                for (item in newvals) {
                    if (newvals[item].length > 0 && newvals[item] != ' ') {
                        if (newvals[item] == 'OR' || newvals[item] == 'AND') {
                            newstring += newvals[item] + ' ';
                        } else {
                            newstring += newvals[item] + '~ ';
                        }
                    }
                }
                $('#facetview_freetext').val(newstring);
            } else if ( $(this).attr('id') == "facetview_exact_match" ) {
                var newvals = $('#facetview_freetext').val().replace(/"/gi,'').replace(/\*/gi,'').replace(/\~/gi,'').split(' ');
                var newstring = "";
                for (item in newvals) {
                    if (newvals[item].length > 0 && newvals[item] != ' ') {
                        if (newvals[item] == 'OR' || newvals[item] == 'AND') {
                            newstring += newvals[item] + ' ';
                        } else {
                            newstring += '"' + newvals[item] + '" ';
                        }
                    }
                }
                $.trim(newstring,' ');
                $('#facetview_freetext').val(newstring);
            } else if ( $(this).attr('id') == "facetview_match_all" ) {
                $('#facetview_freetext').val($.trim($('#facetview_freetext').val().replace(/ OR /gi,' ')));
                $('#facetview_freetext').val($('#facetview_freetext').val().replace(/ /gi,' AND '));
            } else if ( $(this).attr('id') == "facetview_match_any" ) {
                $('#facetview_freetext').val($.trim($('#facetview_freetext').val().replace(/ AND /gi,' ')));
                $('#facetview_freetext').val($('#facetview_freetext').val().replace(/ /gi,' OR '));
            }
            $('#facetview_freetext').focus().trigger('keyup');
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
        var thefacetview = ' \
           <div id="facetview"> \
             <div class="row-fluid"> \
               <div class="span3"> \
                 <div id="facetview_filters"></div> \
               </div> \
               <div class="span9"> \
                 <form method="GET" action="#search"> \
                   <div id="facetview_searchbar" style="display:inline; float:left;" class="input-prepend"> \
                   <span class="add-on"><i class="icon-search"></i></span> \
                   <input class="span4" id="facetview_freetext" name="q" value="" placeholder="search term" autofocus /> \
                   </div> \
                   <div style="display:inline; float:left;margin-left:-2px;" class="btn-group"> \
                    <a style="-moz-border-radius:0px 3px 3px 0px; \
                    -webkit-border-radius:0px 3px 3px 0px; border-radius:0px 3px 3px 0px;" \
                    class="btn dropdown-toggle" data-toggle="dropdown" href="#"> \
                    <i class="icon-cog"></i> <span class="caret"></span></a> \
                    <ul class="dropdown-menu"> \
                    <li><a id="facetview_partial_match" href="">partial match</a></li> \
                    <li><a id="facetview_exact_match" href="">exact match</a></li> \
                    <li><a id="facetview_fuzzy_match" href="">fuzzy match</a></li> \
                    <li><a id="facetview_match_all" href="">match all</a></li> \
                    <li><a id="facetview_match_any" href="">match any</a></li> \
                    <li><a href="#">clear all</a></li> \
                    <li><a target="_blank" \
                    href="http://lucene.apache.org/java/2_9_1/queryparsersyntax.html"> \
                    learn more</a></li> \
                    <li class="divider"></li> \
                    <li><a id="facetview_howmany" href="#">results per page ({{HOW_MANY}})</a></li> \
                    </ul> \
                   </div> \
                   <div style="clear:both;" id="facetview_selectedfilters"></div> \
                 </form> \
                 <table class="table table-striped" id="facetview_results"></table> \
                 <div id="facetview_metadata"></div> \
               </div> \
             </div> \
           </div> \
           ';


        // ===============================================
        // now create the plugin on the page
        return this.each(function() {
            // get this object
            obj = $(this);

            // append the facetview object to this object
            thefacetview = thefacetview.replace(/{{HOW_MANY}}/gi,options.paging.size)
            $(obj).append(thefacetview);

            // setup search option triggers
            $('#facetview_partial_match').bind('click',fixmatch)
            $('#facetview_exact_match').bind('click',fixmatch)
            $('#facetview_fuzzy_match').bind('click',fixmatch)
            $('#facetview_match_any').bind('click',fixmatch)
            $('#facetview_match_all').bind('click',fixmatch)
            $('#facetview_howmany').bind('click',howmany)

            // resize the searchbar
            var thewidth = $('#facetview_searchbar').parent().parent().width()
            $('#facetview_searchbar').css('width',thewidth - 50 + 'px')
            $('#facetview_freetext').css('width', thewidth - 88 + 'px')

            // append the filters to the facetview object
            buildfilters();
            if (options.description) {
                $('#facetview_filters').append('<div><h3>Meta</h3>' + options.description + '</div>')
            }
            $('#facetview_freetext',obj).bindWithDelay('keyup',dosearch,options.freetext_submit_delay);

            // trigger the search once on load, to get all results
            dosearch();

        }); // end of the function  


    };
})(jQuery);


