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
 * 2012-09-06: MW added semicolons to the end of statements for better compatibility with Rails asset pipeline
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
    };
})(jQuery);

// add extension to jQuery with a function to get URL parameters
jQuery.extend({
    getUrlVars: function() {
        var params = new Object;
        var hashes = window.location.href.slice(window.location.href.indexOf('?') + 1).split('&');
        for ( var i = 0; i < hashes.length; i++ ) {
            hash = hashes[i].split('=');
            if ( hash.length > 1 ) {
                if ( hash[1].replace(/%22/gi,"")[0] == "[" || hash[1].replace(/%22/gi,"")[0] == "{" ) {
                    hash[1] = hash[1].replace(/^%22/,"").replace(/%22$/,"");
                    var newval = JSON.parse(unescape(hash[1].replace(/%22/gi,'"')));
                } else {
                    var newval = unescape(hash[1].replace(/%22/gi,'"'));
                }
                params[hash[0]] = newval;
            }
        }
        return params;
    },
    getUrlVar: function(name){
        return jQuery.getUrlVars()[name];
    }
});


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
            ];




        // specify the defaults
        var defaults = {
            "searchbox_class": ".facetview_freetext",// the class of the search boxes - only the value in the last found box will count
            "searchbox_shade": "#ecf4ff",           // the colour of the search box background
            "embedded_search": true,                // whether or not to put a search bar on the page (if not, another must be identified manually)
            "sharesave_link": true,                 // if true, a share/save button will be shown next to the search bar that gives a link to the current result set
            "config_file": false,                   // a remote config file URL
            "facets":[],                            // facet objects: {"field":"blah", "display":"arg",...}
                                                    // be sure if you expect to define any of these as nested that you use their full scope eg. nestedobj.nestedfield
            "extra_facets": {},                     // any extra facet queries, so results can be retrieved - NOT used for filter buttons. define as per elasticsearch facets
            "allow_facet_logic_choice": false,      // whether or not users can change facet logic from default - say from AND to OR
            "searchbox_fieldselect": [],            // a list of objects describing fields to which search terms can be restricted. each object requires 'display' for nice human-readable display option, and 'field' for field to actually search on
            "search_sortby": [],                    // a list of objects describing sort option dropdowns. each object requires 'display' for a nice huma-readable display option, and 'field' for the field that sorting will actually occur on. NOTE sort fields must be unique on your ES index, not lists. Otherwise it will fail silently. Choose wisely.
            "enable_rangeselect": false,            // enable or disable the ability to select a range across a filter - RANGES NEED SOME WORK AFTER RECENT UPDATE, KEEP DISABLED FOR NOW
            "default_facet_logic": "AND",           // how facet choices should be applied to the query by default
            "result_display": resdisplay,           // display template for search results
            "display_images": true,                 // whether or not to display images found in links in search results
            "description":"",                       // a description of the current search to embed in the display
            "search_url":"",                        // the URL against which to submit searches
            "datatype":"jsonp",                     // the datatype for the search url - json for local, jsonp for remote
            "initialsearch":true,                   // whether or not to search on first load
            "search_index":"elasticsearch",         // elasticsearch or SOLR - SOLR does not actually work at the moment though...
            "fields": false,                        // a list of the fields for the query to return, if not just wanting the default all
            "partial_fields": false,                // a definition of which fields to return, as per elasticsearch docs http://www.elasticsearch.org/guide/reference/api/search/fields.html
            "nested": [],                           // a list of keys for which the content should be considered nested for query and facet purposes
                                                    // NOTE this requires you refer to such keys with their full scope e.g. nestedobj.nestedfield. only works on top-level keys so far
            "default_url_params":{},                // any params that the search URL needs by default
            "freetext_submit_delay":"500",          // delay for auto-update of search results
            "query_parameter":"q",                  // the query parameter if required for setting to the search URL
            "q":"",                                 // default query value
            "predefined_filters":{},                // queries to apply to all searches. give each one a reference key, then inside define it as per an ES query for appending to the "must" 
                                                    // if these filters should be applied at the nested level, then prefix the name with the relevant nesting prefix. e.g. if your nested object
                                                    // is called stats, call your filter stats.MYFILTER
            "paging":{
                "from":0,                           // where to start the results from
                "size":10                           // how many results to get
            },
            "pager_on_top": false,                  // set to true to show pager (less, more, total) on top as well as bottom of search results
            "sort":[],                              // sort parameters for result set, as per elasticsearch
            "searchwrap_start":'<table class="table table-striped table-bordered" id="facetview_results">',                  // wrap the search result set in these tags
            "searchwrap_end":"</table>",            // wrap the search result set in these tags
            "resultwrap_start":"<tr><td>",          // wrap a given result in this
            "resultwrap_end":"</td></tr>",          // wrap a given result in this
            "result_box_colours":[],                // apply random bg color from the list to each .result_colour element
            "fadein":800,                           // fadein effect on results in ms   
            "post_search_callback": false           // if this is defined as a function, it will be called any time new results are retrieved and drawn on the page
        };


        // and add in any overrides from the call
        // these options are also overridable by URL parameters
        // facetview options are declared as a function so they are available externally
        // (see bottom of this file)

        var provided_options = $.extend(defaults, options);
        var url_options = $.getUrlVars();
        $.fn.facetview.options = $.extend(provided_options,url_options);
        var options = $.fn.facetview.options;


        // ===============================================
        // functions to do with filters
        // ===============================================
        
        // show the filter values
        var showfiltervals = function(event) {
            event.preventDefault();
            if ( $(this).hasClass('facetview_open') ) {
                $(this).children('i').replaceWith('<i class="icon-plus"></i>');
                $(this).removeClass('facetview_open');
                $('#facetview_' + $(this).attr('rel') ).children().find('.facetview_filtervalue').hide();
                $(this).siblings('.facetview_filteroptions').hide();
            } else {
                $(this).children('i').replaceWith('<i class="icon-minus"></i>');
                $(this).addClass('facetview_open');
                $('#facetview_' + $(this).attr('rel') ).children().find('.facetview_filtervalue').show();
                $(this).siblings('.facetview_filteroptions').show();
            }
        };

        // function to perform for sorting of filters
        var sortfilters = function(event) {
            event.preventDefault();
            var sortwhat = $(this).attr('href');
            var which = 0;
            for (item in options.facets) {
                if ('field' in options.facets[item]) {
                    if ( options.facets[item]['field'] == sortwhat) {
                        which = item;
                    }
                }
            }
            // iterate to next sort type on click. order is term, rterm, count, rcount
            if ( $(this).hasClass('facetview_term') ) {
                options.facets[which]['order'] = 'reverse_term';
                $(this).html('a-z <i class="icon-arrow-up"></i>');
                $(this).removeClass('facetview_term').addClass('facetview_rterm');
            } else if ( $(this).hasClass('facetview_rterm') ) {
                options.facets[which]['order'] = 'count';
                $(this).html('count <i class="icon-arrow-down"></i>');
                $(this).removeClass('facetview_rterm').addClass('facetview_count');
            } else if ( $(this).hasClass('facetview_count') ) {
                options.facets[which]['order'] = 'reverse_count';
                $(this).html('count <i class="icon-arrow-up"></i>');
                $(this).removeClass('facetview_count').addClass('facetview_rcount');
            } else if ( $(this).hasClass('facetview_rcount') ) {
                options.facets[which]['order'] = 'term';
                $(this).html('a-z <i class="icon-arrow-down"></i>');
                $(this).removeClass('facetview_rcount').addClass('facetview_term');
            }
            dosearch();
        };
        
        // adjust how many results are shown
        var morefacetvals = function(event) {
            event.preventDefault();
            var morewhat = options.facets[ $(this).attr('rel') ];
            if ('size' in morewhat ) {
                var currentval = morewhat['size'];
            } else {
                var currentval = 10;
            }
            var newmore = prompt('Currently showing ' + currentval + 
                '. There are ' + '' + 'in total. How many would you like instead?');
            if (newmore) {
                options.facets[ $(this).attr('rel') ]['size'] = parseInt(newmore);
                $(this).html(newmore);
                dosearch();
            }
        };

        // insert a facet range once selected
        var dofacetrange = function(rel) {
            $('#facetview_rangeresults_' + rel).remove();
            var range = $('#facetview_rangechoices_' + rel).html();
            var newobj = '<div style="display:none;" class="btn-group" id="facetview_rangeresults_' + rel + '"> \
                <a class="facetview_filterselected facetview_facetrange facetview_clear \
                btn btn-info" rel="' + rel + 
                '" alt="remove" title="remove"' +
                ' href="' + $(this).attr("href") + '">' +
                range + ' <i class="icon-white icon-remove"></i></a></div>';
            $('#facetview_selectedfilters').append(newobj);
            $('.facetview_filterselected').unbind('click',clearfilter);
            $('.facetview_filterselected').bind('click',clearfilter);
            options.paging.from = 0;
            dosearch();
        };
        // clear a facet range
        var clearfacetrange = function(event) {
            event.preventDefault();
            $('#facetview_rangeresults_' + $(this).attr('rel')).remove();
            $('#facetview_rangeplaceholder_' + $(this).attr('rel')).remove();
            dosearch();
        };
        // build a facet range selector
        var facetrange = function(event) {
            // TODO: when a facet range is requested, should hide the facet list from the menu
            // should perhaps also remove any selections already made on that facet
            event.preventDefault();
            var rel = $(this).attr('rel');
            var rangeselect = '<div id="facetview_rangeplaceholder_' + rel + '" class="facetview_rangecontainer clearfix"> \
                <div class="clearfix"> \
                <h3 id="facetview_rangechoices_' + rel + '" style="margin-left:10px; margin-right:10px; float:left; clear:none;" class="clearfix"> \
                <span class="facetview_lowrangeval_' + rel + '">...</span> \
                <small>to</small> \
                <span class="facetview_highrangeval_' + rel + '">...</span></h3> \
                <div style="float:right;" class="btn-group">';
            if ( options.allow_facet_logic_choice ) {
                rangeselect += '<a class="btn facetview_facetlogic" rel="' + options.facets[rel]['field'].replace('.','_') + 
                    '" id="facetview_facetlogic_' + options.facets[rel]['field'].replace('.','_') + '" href="">' +
                    options.default_facet_logic + '</a>';
            }
            rangeselect += '<a class="facetview_facetrange_remove btn" rel="' + rel + '" alt="remove" title="remove" \
                 href="#"><i class="icon-remove"></i></a> \
                </div></div> \
                <div class="clearfix" style="margin:20px;" id="facetview_slider_' + rel + '"></div> \
                </div>';
            $('#facetview_selectedfilters').after(rangeselect);
            $('.facetview_facetrange_remove').unbind('click',clearfacetrange);
            $('.facetview_facetrange_remove').bind('click',clearfacetrange);
            $('.facetview_facetlogic').unbind('click',changelogic);
            $('.facetview_facetlogic').bind('click',changelogic);
            var values = [];
            var valsobj = $( '#facetview_' + $(this).attr('href').replace(/\./gi,'_') );
            valsobj.find('.facetview_filterchoice').each(function() {
                values.push( $(this).attr('href') );
            });
            values = values.sort();
            $( "#facetview_slider_" + rel ).slider({
                range: true,
                min: 0,
                max: values.length-1,
                values: [0,values.length-1],
                slide: function( event, ui ) {
                    $('#facetview_rangechoices_' + rel + ' .facetview_lowrangeval_' + rel).html( values[ ui.values[0] ] );
                    $('#facetview_rangechoices_' + rel + ' .facetview_highrangeval_' + rel).html( values[ ui.values[1] ] );
                    dofacetrange( rel );
                }
            });
            $('#facetview_rangechoices_' + rel + ' .facetview_lowrangeval_' + rel).html( values[0] );
            $('#facetview_rangechoices_' + rel + ' .facetview_highrangeval_' + rel).html( values[ values.length-1] );
        };


        // pass a list of filters to be displayed
        var buildfilters = function() {
            if ( options.facets.length > 0 ) {
                var filters = options.facets;
                var thefilters = '';
                for ( var idx in filters ) {
                    var _filterTmpl = '<table id="facetview_{{FILTER_NAME}}" class="facetview_filters table table-bordered table-condensed table-striped" style="display:none;"> \
                        <tr class="facetview_facetheader"><td><a class="facetview_filtershow" title="filter by {{FILTER_DISPLAY}}" rel="{{FILTER_NAME}}" \
                        style="color:#333; font-weight:bold;" href=""><i class="icon-plus"></i> {{FILTER_DISPLAY}} \
                        </a> \
                        <div class="btn-group facetview_filteroptions" style="display:none; margin-top:5px;"> \
                            <a class="btn btn-small facetview_learnmore" title="click to view search help information" href="#"><b>?</b></a> \
                            <a class="btn btn-small facetview_morefacetvals" title="filter list size" rel="{{FACET_IDX}}" href="{{FILTER_EXACT}}">{{FILTER_HOWMANY}}</a> \
                            <a class="btn btn-small facetview_sort facetview_term" title="filter value order" href="{{FILTER_EXACT}}">a-z <i class="icon-arrow-down"></i></a>';
                    if ( options.enable_rangeselect ) {
                        _filterTmpl += '<a class="btn btn-small facetview_facetrange" title="make a range selection on this filter" rel="{{FACET_IDX}}" href="{{FILTER_EXACT}}">range</a>';
                    }
                    _filterTmpl +='</div> \
                        </td></tr> \
                        </table>';
                    _filterTmpl = _filterTmpl.replace(/{{FILTER_NAME}}/g, filters[idx]['field'].replace(/\./gi,'_')).replace(/{{FILTER_EXACT}}/g, filters[idx]['field']);
                    thefilters += _filterTmpl;
                    if ('size' in filters[idx] ) {
                        thefilters = thefilters.replace(/{{FILTER_HOWMANY}}/gi, filters[idx]['size']);
                    } else {
                        thefilters = thefilters.replace(/{{FILTER_HOWMANY}}/gi, 10);
                    };
                    thefilters = thefilters.replace(/{{FACET_IDX}}/gi,idx);
                    if ('display' in filters[idx]) {
                        thefilters = thefilters.replace(/{{FILTER_DISPLAY}}/g, filters[idx]['display']);
                    } else {
                        thefilters = thefilters.replace(/{{FILTER_DISPLAY}}/g, filters[idx]['field']);
                    };
                };
                $('#facetview_filters').html("").append(thefilters);
                $('.facetview_morefacetvals').bind('click',morefacetvals);
                $('.facetview_facetrange').bind('click',facetrange);
                $('.facetview_sort').bind('click',sortfilters);
                $('.facetview_filtershow').bind('click',showfiltervals);
                $('.facetview_learnmore').unbind('click',learnmore);
                $('.facetview_learnmore').bind('click',learnmore);
                options.description ? $('#facetview_filters').append('<div><h3>Meta</h3>' + options.description + '</div>') : "";
            };
        };

        // set the available filter values based on results
        var putvalsinfilters = function(data) {
            // for each filter setup, find the results for it and append them to the relevant filter
            for ( var each in options.facets ) {
                $('#facetview_' + options.facets[each]['field'].replace(/\./gi,'_')).children().find('.facetview_filtervalue').remove();
                var records = data["facets"][ options.facets[each]['field'] ];
                for ( var item in records ) {
                    var append = '<tr class="facetview_filtervalue" style="display:none;"><td><a class="facetview_filterchoice' +
                        '" rel="' + options.facets[each]['field'] + '" href="' + item + '">' + item +
                        ' (' + records[item] + ')</a></td></tr>';
                    $('#facetview_' + options.facets[each]['field'].replace(/\./gi,'_')).append(append);
                }
                if ( $('.facetview_filtershow[rel="' + options.facets[each]['field'].replace(/\./gi,'_') + '"]').hasClass('facetview_open') ) {
                    $('#facetview_' + options.facets[each]['field'].replace(/\./gi,'_') ).children().find('.facetview_filtervalue').show();
                }
            }
            $('.facetview_filterchoice').bind('click',clickfilterchoice);
            $('.facetview_filters').each(function() {
                if ( $(this).children().find('.facetview_filtervalue').length > 1 ) {
                    $(this).show();
                } else {
                    $(this).hide();
                };
            });
        };

        
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
                    if ( options.fields ) {
                        resultobj["records"].push(dataobj.hits.hits[item].fields);
                    } else if ( options.partial_fields ) {
                        var keys = [];
                        for(var key in options.partial_fields){
                            keys.push(key);
                        }
                        resultobj["records"].push(dataobj.hits.hits[item].fields[keys[0]]);
                    } else {
                        resultobj["records"].push(dataobj.hits.hits[item]._source);
                    }
                }
                resultobj["start"] = "";
                resultobj["found"] = dataobj.hits.total;
                for (var item in dataobj.facets) {
                    var facetsobj = new Object();
                    for (var thing in dataobj.facets[item]["terms"]) {
                        facetsobj[ dataobj.facets[item]["terms"][thing]["term"] ] = dataobj.facets[item]["terms"][thing]["count"];
                    }
                    resultobj["facets"][item] = facetsobj;
                }
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
        };

        // decrement result set
        var decrement = function(event) {
            event.preventDefault();
            if ( $(this).html() != '..' ) {
                options.paging.from = options.paging.from - options.paging.size;
                options.paging.from < 0 ? options.paging.from = 0 : "";
                dosearch();
            }
        };

        // increment result set
        var increment = function(event) {
            event.preventDefault();
            if ( $(this).html() != '..' ) {
                options.paging.from = parseInt($(this).attr('href'));
                dosearch();
            }
        };



        // write the metadata to the page
        var putmetadata = function(data) {
            if ( typeof(options.paging.from) != 'number' ) {
                options.paging.from = parseInt(options.paging.from);
            }
            if ( typeof(options.paging.size) != 'number' ) {
                options.paging.size = parseInt(options.paging.size);
            }
            var metaTmpl = '<div class="pagination"> \
                <ul> \
                  <li class="prev"><a class="facetview_decrement" href="{{from}}">&laquo; back</a></li> \
                  <li class="active"><a>{{from}} &ndash; {{to}} of {{total}}</a></li> \
                  <li class="next"><a class="facetview_increment" href="{{to}}">next &raquo;</a></li> \
                </ul> \
              </div>';
            $('.facetview_metadata').first().html("Not found...");
            if (data.found) {
                var from = options.paging.from + 1;
                var size = options.paging.size;
                !size ? size = 10 : "";
                var to = options.paging.from+size;
                data.found < to ? to = data.found : "";
                var meta = metaTmpl.replace(/{{from}}/g, from);
                meta = meta.replace(/{{to}}/g, to);
                meta = meta.replace(/{{total}}/g, data.found);
                $('.facetview_metadata').html("").append(meta);
                $('.facetview_decrement').bind('click',decrement);
                from < size ? $('.facetview_decrement').html('..') : "";
                $('.facetview_increment').bind('click',increment);
                data.found <= to ? $('.facetview_increment').html('..') : "";
            }
        };

        // given a result record, build how it should look on the page
        var buildrecord = function(index) {
            var record = options.data['records'][index];
            var result = options.resultwrap_start;
            // add first image where available
            if (options.display_images) {
                var recstr = JSON.stringify(record);
                var regex = /(http:\/\/\S+?\.(jpg|png|gif|jpeg))/;
                var img = regex.exec(recstr);
                if (img) {
                    result += '<img class="thumbnail" style="float:left; width:100px; margin:0 5px 10px 0; max-height:150px;" src="' + img[0] + '" />';
                }
            }
            // add the record based on display template if available
            var display = options.result_display;
            var lines = '';
            for (var lineitem in display) {
                line = "";
                for (object in display[lineitem]) {
                    var thekey = display[lineitem][object]['field'];
                    parts = thekey.split('.');
                    // TODO: this should perhaps recurse..
                    if (parts.length == 1) {
                        var res = record;
                    } else if (parts.length == 2) {
                        var res = record[parts[0]];
                    } else if (parts.length == 3) {
                        var res = record[parts[0]][parts[1]];
                    }
                    var counter = parts.length - 1;
                    if (res && res.constructor.toString().indexOf("Array") == -1) {
                        var thevalue = res[parts[counter]];  // if this is a dict
                    } else {
                        var thevalue = [];
                        for (var row in res) {
                            thevalue.push(res[row][parts[counter]]);
                        }
                    }
                    if (thevalue && thevalue.length) {
                        display[lineitem][object]['pre']
                            ? line += display[lineitem][object]['pre'] : false;
                        if ( typeof(thevalue) == 'object' ) {
                            for (var val in thevalue) {
                                val != 0 ? line += ', ' : false;
                                line += thevalue[val];
                            }
                        } else {
                            line += thevalue;
                        }
                        display[lineitem][object]['post'] 
                            ? line += display[lineitem][object]['post'] : line += ' ';
                    }
                }
                if (line) {
                    lines += line.replace(/^\s/,'').replace(/\s$/,'').replace(/\,$/,'') + "<br />";
                }
            }
            lines ? result += lines : result += JSON.stringify(record,"","    ");
            result += options.resultwrap_end;
            return result;
        };

        // view a full record when selected
        var viewrecord = function(event) {
            event.preventDefault();
            var record = options.data['records'][$(this).attr('href')];
            alert(JSON.stringify(record,"","    "));
            
        }

        // put the results on the page
        showresults = function(sdata) {
            options.rawdata = sdata;
            // get the data and parse from the solr / es layout
            var data = parseresults(sdata);
            options.data = data;
            // change filter options
            putvalsinfilters(data);
            // put result metadata on the page
            putmetadata(data);
            // put the filtered results on the page
            $('#facetview_results').html("");
            var infofiltervals = new Array();
            $.each(data.records, function(index, value) {
                // write them out to the results div
                 if (options.renderer) {
                     $('#facetview_results').append("<tr><td></td></tr>");
                     options.renderer(value, $('#facetview_results tr:last-child td'));
                 } else {
                     $('#facetview_results').append( buildrecord(index) );
                     $('#facetview_results tr:last-child').linkify();
                 }
            })
            if ( options.result_box_colours.length > 0 ) {
                jQuery('.result_box').each(function () {
                    var colour = options.result_box_colours[Math.floor(Math.random()*options.result_box_colours.length)] ;
                jQuery(this).css("background-color", colour);
                });
            }
            $('#facetview_results').children().hide().fadeIn(options.fadein);
            $('.facetview_viewrecord').bind('click',viewrecord);
            jQuery('.notify_loading').hide();
            // if a post search callback is provided, run it
            if (typeof options.post_search_callback == 'function') {
                options.post_search_callback.call(this);
            }
        };

        // ===============================================
        // functions to do with searching
        // ===============================================

        // build the search query URL based on current params
        // NOTE: SOLR SEARCH QUERY IS NOW WOEFULLY INADEQUATE - MANY NEW FEATURES WILL JUST NOT WORK, IF THE QUERY ITSELF EVEN WORKS AT ALL
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
            //for (var item in options.predefined_filters) {
            //    query += item + ":" + options.predefined_filters[item] + " AND ";
            //}
            $('.facetview_filterselected',obj).each(function() {
                query += $(this).attr('rel') + ':"' + 
                    $(this).attr('href') + '" AND ';
            });
            // add any freetext filter
            if (options.q != "") {
                query += options.q + '*';
            }
            query = query.replace(/ AND $/,"");
            // set a default for blank search
            if (query == "") {
                query = "*:*";
            }
            theurl += query;
            return theurl;
        };

        // build the search query URL based on current params
        var elasticsearchquery = function() {
            var qs = {};
            var bool = false;
            var nested = false;
            // TODO: add a check to see if this is an OR query with only one val - 
            // in which case ensure the search query is at least *
            $('.facetview_filterselected',obj).each(function() {
                !bool ? bool = {'must': [] } : "";
                var logic = options.default_facet_logic;
                if ( $(this).hasClass('facetview_facetrange') ) {
                    var rngs = {
                        'from': $('.facetview_lowrangeval_' + $(this).attr('rel'), this).html(),
                        'to': $('.facetview_highrangeval_' + $(this).attr('rel'), this).html()
                    };
                    var rel = options.facets[ $(this).attr('rel') ]['field'];
                    options.allow_facet_logic_choice && $('#facetview_facetlogic_' + rel.replace('.','_')).html() != 'AND' ? logic = 'OR' : "";
                    logic != 'AND' && bool['should'] == undefined ? bool['should'] = [] : "";
                    var obj = {'range': {}};
                    obj['range'][ rel ] = rngs;
                    // check if this should be a nested query
                    var parts = rel.split('.');
                    if ( options.nested.indexOf(parts[0]) != -1 ) {
                        if (logic == 'AND') {
                            !nested ? nested = {"nested":{"_scope":parts[0],"path":parts[0],"query":{"bool":{"must":[obj]}}}} : nested.nested.query.bool.must.push(obj);
                        } else {
                            !nested ? nested = {"nested":{"_scope":parts[0],"path":parts[0],"query":{"bool":{"should":[obj]}}}} : nested.nested.query.bool.should.push(obj);
                        }
                    } else {
                        logic == 'AND' ? bool['must'].push(obj) : bool['should'].push(obj);
                    }
                } else {
                    var obj = {'term':{}};
                    obj['term'][ $(this).attr('rel') ] = $(this).attr('href');
                    options.allow_facet_logic_choice && $('#facetview_facetlogic_' + $(this).attr('rel').replace('.','_')).html() != 'AND' ? logic = 'OR' : "";
                    logic != 'AND' && bool['should'] == undefined ? bool['should'] = [] : "";
                    // check if this should be a nested query
                    var parts = $(this).attr('rel').split('.');
                    if ( options.nested.indexOf(parts[0]) != -1 ) {
                        if (logic == 'AND') {
                            !nested ? nested = {"nested":{"_scope":parts[0],"path":parts[0],"query":{"bool":{"must":[obj]}}}} : nested.nested.query.bool.must.push(obj);
                        } else {
                            !nested ? nested = {"nested":{"_scope":parts[0],"path":parts[0],"query":{"bool":{"should":[obj]}}}} : nested.nested.query.bool.should.push(obj);
                        }
                    } else {
                        logic == 'AND' ? bool['must'].push(obj) : bool['should'].push(obj);
                    }
                }
            });
            for (var item in options.predefined_filters) {
                !bool ? bool = {'must': [] } : "";
                var obj = options.predefined_filters[item];
                var parts = item.split('.');
                if ( options.nested.indexOf(parts[0]) != -1 ) {
                    !nested ? nested = {"nested":{"_scope":parts[0],"path":parts[0],"query":{"bool":{"must":[obj]}}}} : nested.nested.query.bool.must.push(obj);
                } else {
                    bool['must'].push(obj);
                }
            }
            if (bool) {
                if ( options.q != "" ) {
                    var qryval = { 'query': options.q };
                    $('.facetview_searchfield').val() != "" ? qryval.default_field = $('.facetview_searchfield').val() : "";
                    bool['must'].push( {'query_string': qryval } );
                };
                nested ? bool['must'].push(nested) : "";
                qs['query'] = {'bool': bool};
            } else {
                if ( options.q != "" ) {
                    var qryval = { 'query': options.q };
                    $('.facetview_searchfield').val() != "" ? qryval.default_field = $('.facetview_searchfield').val() : "";
                    qs['query'] = {'query_string': qryval };
                } else {
                    qs['query'] = {'match_all': {}};
                };
            };
            // set any paging
            options.paging.from != 0 ? qs['from'] = options.paging.from : "";
            options.paging.size != 10 ? qs['size'] = options.paging.size : "";
            // set any sort or fields options
            options.sort.length > 0 ? qs['sort'] = options.sort : "";
            options.fields ? qs['fields'] = options.fields : "";
            options.partial_fields ? qs['partial_fields'] = options.partial_fields : "";
            // set any facets
            qs['facets'] = {};
            for (var item in options.facets) {
                var obj = jQuery.extend(true, {}, options.facets[item] );
                delete obj['display'];
                var parts = obj['field'].split('.');
                qs['facets'][obj['field']] = {"terms":obj};
                if ( options.nested.indexOf(parts[0]) != -1 ) {
                    nested ? qs['facets'][obj['field']]["scope"] = parts[0] : qs['facets'][obj['field']]["nested"] = parts[0];
                }
            }
            jQuery.extend(true, qs['facets'], options.extra_facets );
            //alert(JSON.stringify(qs,"","    "));
            options.querystring = JSON.stringify(qs);
            options.sharesave_link ? $('.facetview_sharesaveurl').val('http://' + window.location.host + window.location.pathname + '?source=' + options.querystring) : "";
            return JSON.stringify(qs);
        };

        // execute a search
        var dosearch = function() {
            jQuery('.notify_loading').show();
            // update the options with the latest q value
            $(options.searchbox_class).each(function() {
                options.q = $(this).val();
            });
            // make the search query
            if ( options.search_index == "elasticsearch" ) {
              // check for provision of a source url param, and if so use it then wipe it
              // TODO: update showresults so that query from source are built into display
              if ( options.source ) {
                var qrystr = JSON.stringify(options.source);
                options.source = false;
              } else {
                var qrystr = elasticsearchquery();
              }
              $.ajax({
                type: "get",
                url: options.search_url,
                data: {source: qrystr},
                // processData: false,
                dataType: options.datatype,
                success: showresults
              });
            } else {
                $.ajax( { type: "get", url: solrsearchquery(), dataType:options.datatype, jsonp:"json.wrf", success: function(data) { showresults(data) } } );
            }
        };

        // trigger a search when a filter choice is clicked
        var clickfilterchoice = function(event) {
            event.preventDefault();
                
            var newobj = '<a class="facetview_filterselected facetview_clear ' + 
                'btn btn-info" rel="' + $(this).attr("rel") + 
                '" alt="remove" title="remove"' +
                ' href="' + $(this).attr("href") + '">' +
                $(this).html().replace(/\(.*\)/,'') + ' <i class="icon-white icon-remove" style="margin-top:1px;"></i></a>';

            if ( $('#facetview_facetlogicgroup_' + $(this).attr("rel").replace('.','_')).length ) {
                $('#facetview_facetlogicgroup_' + $(this).attr("rel").replace('.','_')).append(newobj);
            } else {
                var preobj = '<div id="facetview_facetlogicgroup_' + $(this).attr("rel").replace('.','_') + '" class="btn-group">';
                if ( options.allow_facet_logic_choice ) {
                    preobj += '<a class="btn facetview_facetlogic" id="facetview_facetlogic_' + $(this).attr("rel").replace('.','_') +
                    '" alt="switch logic" rel="' + $(this).attr("rel") + '" href="">';
                    preobj += options.default_facet_logic;
                    preobj += '</a>';
                    newobj = preobj + newobj + '</div>';
                }
                $('#facetview_selectedfilters').append(newobj);
            }

            $('.facetview_filterselected').unbind('click',clearfilter);
            $('.facetview_filterselected').bind('click',clearfilter);
            $('.facetview_facetlogic').unbind('click',changelogic);
            $('.facetview_facetlogic').bind('click',changelogic);
            options.paging.from = 0;
            dosearch();
        };

        // clear a filter when clear button is pressed, and re-do the search
        var clearfilter = function(event) {
            event.preventDefault();
            if ( options.allow_facet_logic_choice && $(this).siblings().length == 1 ) {
                // when AND/OR choice is allowed, but there is only one val, clear the whole thing
                $(this).parent().remove();
            } else {
                // otherwise only clear the item itself
                $(this).remove();
            }
            dosearch();
        };
        
        // change selected facet logic between AND and OR
        var changelogic = function(event) {
            event.preventDefault();
            if ( $(this).html() == 'AND' ) {
                $('#facetview_facetlogic_' + $(this).attr('rel').replace('.','_')).html('&nbsp;OR&nbsp;');
            } else {
                $('#facetview_facetlogic_' + $(this).attr('rel').replace('.','_')).html('AND');
            }
            dosearch();
        };

        // show search help
        var learnmore = function(event) {
            event.preventDefault();
            $('#facetview_learnmore').toggle();
        };

        // adjust how many results are shown
        var howmany = function(event) {
            event.preventDefault();
            var newhowmany = prompt('Currently displaying ' + options.paging.size + 
                ' results per page. How many would you like instead?');
            if (newhowmany) {
                options.paging.size = parseInt(newhowmany);
                options.paging.from = 0;
                if ( options.embedded_search == true ) {
                    var thewidth = $(options.searchbox_class).width();
                    $(options.searchbox_class).css('width',thewidth - 40 + 'px');
                };
                $('.facetview_howmany').html(options.paging.size);
                dosearch();
            }
        };
        
        // change the search result order
        var order = function(event) {
            event.preventDefault();
            if ( $(this).attr('href') == 'desc' ) {
                $(this).html('<i class="icon-arrow-up"></i>');
                $(this).attr('href','asc');
                $(this).attr('title','current order ascending. Click to change to descending');
            } else {
                $(this).html('<i class="icon-arrow-down"></i>');
                $(this).attr('href','desc');
                $(this).attr('title','current order descending. Click to change to ascending');
            };
            orderby();
        };
        var orderby = function(event) {
            event ? event.preventDefault() : "";
            var sortchoice = $('.facetview_orderby').val();
            if ( sortchoice.length != 0 ) {
                var sorting = {};
                var sorton = sortchoice;
                sorting[sorton] = {'order': $('.facetview_order').attr('href')};
                options.sort = [sorting];
            } else {
                options.sort = [];
            }
            options.paging.from = 0;
            dosearch();
        };
        
        // show the current url with the result set as the source param
        var sharesave = function(event) {
            event.preventDefault();
            $('.facetview_sharesavebox').toggle();
        };
        
        // adjust the search field focus
        var searchfield = function(event) {
            event.preventDefault();
            options.paging.from = 0;
            dosearch();
        };

        // a help box for embed in the facet view object below
        var thehelp = '<div id="facetview_learnmore" class="well" style="margin-top:10px; display:none;">'
        options.sharesave_link ? thehelp += '<p>Share or save the current search by clicking the share/save arrow button on the right.</p>' : "";
        thehelp += '<p><b>Partial matches with wildcard</b> can be performed by using the asterisk <b>*</b> wildcard. For example, <b>einste*</b>, <b>*nstei*</b>.</p> \
            <p><b>Fuzzy matches</b> can be performed using tilde <b>~</b>. For example, <b>einsten~</b> may help find <b>einstein</b>.</p> \
            <p><b>Exact matches</b> can be performed with <b>"</b> double quotes. For example <b>"einstein"</b> or <b>"albert einstein"</b>.</p> \
            <p>Match all search terms by concatenating them with <b>AND</b>. For example <b>albert AND einstein</b>.</p> \
            <p>Match any term by concatenating them with <b>OR</b>. For example <b>albert OR einstein</b>.</p> \
            <p><b>Combinations</b> will work too, like <b>albert OR einste~</b>, or <b>"albert" "einstein"</b>.</p> \
            <p><b>Result set size</b> can be altered by clicking on the result size number preceding the search box above.</p> \
            <p><b>Remove all</b> search values and settings by clicking the search icon at the left of the search box above.</p>';
        if ( options.searchbox_fieldselect.length > 0 ) {
            thehelp += '<p>By default, terms are searched for across entire record entries. \
                This can be restricted to particular fields by selecting the field of interest from the <b>search field</b> dropdown</p>';
        };
        if ( options.search_sortby.length > 0 ) {
            thehelp += '<p>Choose a field to <b>sort the search results</b> by clicking the double arrow above.</p>';
        };
        if ( options.facets.length > 0 ) {
            thehelp += '<hr></hr>';
            thehelp += '<p>Use the <b>filters</b> on the left to directly select values of interest. \
                Click the filter name to open the list of available terms and show further filter options.</p> \
                <p><b>Filter list size</b> can be altered by clicking on the filter size number<./p> \
                <p><b>Filter list order </b> can be adjusted by clicking the order options - \
                from a-z ascending or descending, or by count ascending or descending.</p> \
                <p>To further assist discovery of particular filter values, use in combination \
                with the main search bar - search terms entered there will automatically adjust the available filter values.</p> \
                <p><b>Apply a filter range</b> rather than just selecting a single value by clicking on the <b>range</b> button. \
                This enables restriction of result sets to within a range of values - for example from year 1990 to 2012.</p> \
                <p>Filter ranges are only available across filter values already in the filter list; \
                so if a wider filter range is required, first increase the filter size then select the filter range.</p>';
        };
        thehelp += '<p><a class="facetview_learnmore label" href="#">close the help</a></p></div>';
        
        // the facet view object to be appended to the page
        var thefacetview = '<div id="facetview"><div class="row-fluid">';
        if ( options.facets.length > 0 ) {
            thefacetview += '<div class="span3"><div id="facetview_filters" style="padding-top:45px;"></div></div>';
            thefacetview += '<div class="span9" id="facetview_rightcol">';
        } else {
            thefacetview += '<div class="span12" id="facetview_rightcol">';
        }
        if ( options.embedded_search == true ) {
            thefacetview += '<div class="btn-group" style="display:inline-block; margin-right:5px;"> \
                <a class="btn btn-small" title="clear all search settings and start again" href=""><i class="icon-remove"></i></a> \
                <a class="btn btn-small facetview_learnmore" title="click to view search help information" href="#"><b>?</b></a> \
                <a class="btn btn-small facetview_howmany" title="change result set size" href="#">{{HOW_MANY}}</a>';
            if ( options.search_sortby.length > 0 ) {
                thefacetview += '<a class="btn btn-small facetview_order" title="current order descending. Click to change to ascending" \
                    href="desc"><i class="icon-arrow-down"></i></a>';
                thefacetview += '</div>';
                thefacetview += '<select class="facetview_orderby" style="border-radius:5px; \
                    -moz-border-radius:5px; -webkit-border-radius:5px; width:100px; background:#eee; margin:0 5px 21px 0;"> \
                    <option value="">order by</option>';
                for ( var each in options.search_sortby ) {
                    var obj = options.search_sortby[each];
                    thefacetview += '<option value="' + obj['field'] + '">' + obj['display'] + '</option>';
                };
                thefacetview += '</select>';
            } else {
                thefacetview += '</div>';
            };
            if ( options.searchbox_fieldselect.length > 0 ) {
                thefacetview += '<select class="facetview_searchfield" style="border-radius:5px 0px 0px 5px; \
                    -moz-border-radius:5px 0px 0px 5px; -webkit-border-radius:5px 0px 0px 5px; width:100px; margin:0 -2px 21px 0; background:' + options.searchbox_shade + ';">';
                thefacetview += '<option value="">search all</option>';
                for ( var each in options.searchbox_fieldselect ) {
                    var obj = options.searchbox_fieldselect[each];
                    thefacetview += '<option value="' + obj['field'] + '">' + obj['display'] + '</option>';
                };
                thefacetview += '</select>';
            };
            thefacetview += '<input type="text" class="facetview_freetext span4" style="display:inline-block; margin:0 0 21px 0; background:' + options.searchbox_shade + ';" name="q" \
                value="" placeholder="search term" autofocus />';
            if ( options.sharesave_link ) {
                thefacetview += '<a class="btn facetview_sharesave" title="share or save this search" style="margin:0 0 21px 5px;" href=""><i class="icon-share-alt"></i></a>';
                thefacetview += '<div class="facetview_sharesavebox alert alert-info" style="display:none;"> \
                    <button type="button" class="facetview_sharesave close">×</button> \
                    <p>Share or save this search:</p> \
                    <textarea class="facetview_sharesaveurl" style="width:100%;height:100px;">http://' + window.location.host + 
                    window.location.pathname + '?source=' + options.querystring + '</textarea> \
                    </div>';
            }
        };
        thefacetview += thehelp;
        thefacetview += '<div style="clear:both;" class="btn-toolbar" id="facetview_selectedfilters"></div>';
        options.pager_on_top ? thefacetview += '<div class="facetview_metadata" style="margin-top:20px;"></div>' : "";
        thefacetview += options.searchwrap_start + options.searchwrap_end;
        thefacetview += '<div class="facetview_metadata"></div></div></div></div>';

        // what to do when ready to go
        var whenready = function() {
            // append the facetview object to this object
            thefacetview = thefacetview.replace(/{{HOW_MANY}}/gi,options.paging.size);
            $(obj).append(thefacetview);

            // bind learn more and how many triggers
            $('.facetview_learnmore').bind('click',learnmore);
            $('.facetview_howmany').bind('click',howmany);
            $('.facetview_searchfield').bind('change',searchfield);
            $('.facetview_orderby').bind('change',orderby);
            $('.facetview_order').bind('click',order);
            $('.facetview_sharesave').bind('click',sharesave);

            // check paging info is available
            !options.paging.size && options.paging.size != 0 ? options.paging.size = 10 : "";
            !options.paging.from ? options.paging.from = 0 : "";

            // set any default search values into the last search bar
            var allempty = true;
            $(options.searchbox_class).each(function() {
                $(this).val().length != 0 ? allempty = false : "";
            });
            allempty && options.q != "" ? $(options.searchbox_class).last().val(options.q) : "";

            // append the filters to the facetview object
            buildfilters();
            $(options.searchbox_class).bindWithDelay('keyup',dosearch,options.freetext_submit_delay);

            // trigger the search once on load if enabled, or if source param provided
            options.initialsearch || options.source ? dosearch() : "";
        };

        // ===============================================
        // now create the plugin on the page
        return this.each(function() {
            // get this object
            obj = $(this);
            
            // check for remote config options, then do first search
            if (options.config_file) {
                $.ajax({
                    type: "get",
                    url: options.config_file,
                    dataType: "jsonp",
                    success: function(data) {
                        options = $.extend(options, data);
                        whenready();
                    },
                    error: function() {
                        $.ajax({
                            type: "get",
                            url: options.config_file,
                            success: function(data) {
                                options = $.extend(options, $.parseJSON(data));
                                whenready();
                            },
                            error: function() {
                                whenready();
                            }
                        });
                    }
                });
            } else {
                whenready();
            }

        }); // end of the function  


    };


    // facetview options are declared as a function so that they can be retrieved
    // externally (which allows for saving them remotely etc)
    $.fn.facetview.options = {};
    
})(jQuery);
