/*
 * jquery.facetview.js
 *
 * displays faceted browse results by querying a specified index
 * can read config locally or can be passed in as variable when executed
 * or a config variable can point to a remote config
 * config options include specifying SOLR or ElasticSearch index
 *
 * open source license - GNU Affero GPL v3
 * 
 * created by Mark MacGillivray - mark@cottagelabs.com
 *
 * http://facetview.cottagelabs.com
 *
*/

// include facetview css - from the same location this script is placed
// if you don't want this functionality, just set cssfromhere equal to the URL of your css file
var scripts = document.getElementsByTagName("script");
var cssfromhere = "";
for ( var item in scripts ) {
    if ( scripts[item].src != undefined ) {
        if ( scripts[item].src.search("jquery.facetview.js") != -1 ) {
            cssfromhere = scripts[item].src.replace("jquery.facetview.js","");
        }
    }
}
cssfromhere += 'facetview.css';

//<![CDATA[
if(document.createStyleSheet) {
    document.createStyleSheet( cssfromhere );
} else {
    var styles = "@import url(" + cssfromhere + ");";
    var newSS = document.createElement('link');
    newSS.rel = 'stylesheet';
    newSS.href = 'data:text/css,'+escape(styles);
    document.getElementsByTagName("head")[0].appendChild(newSS);    
}
//]]>


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

        // specify the defaults
        var defaults = {
            "config_file":false,
            "default_filters":[],
            "result_display_headers":["title"],
            "ignore_fields":["_id","_rev"],
            "header_content":"",
            "footer_content":"",
            "show_advanced":false,
            "search_url":"",
            "search_index":"elasticsearch",
            "default_url_params":{},
            "freetext_submit_delay":"700",
            "query_parameter":"q",
            "q":"*:*",
            "predefined_query_values":{},
            "default_paging":{}
        };

        // and add in any overrides from the call
        var options = $.extend(defaults, options);

        // ===============================================
        // functions to do with filters
        // ===============================================
        
        // show the filter values
        var showfiltervals = function(event) {
            event.preventDefault();
            if ( jQuery(this).hasClass('facetview_open') ) {
                jQuery(this).removeClass('facetview_open');
                jQuery('#facetview_' + jQuery(this).attr('rel') ).children().hide();
                jQuery('#facetview_freetext_' + jQuery(this).attr('rel') ).parent().hide();
            } else {
                jQuery(this).addClass('facetview_open');
                jQuery('#facetview_' + jQuery(this).attr('rel') ).children().show();      
                jQuery('#facetview_freetext_' + jQuery(this).attr('rel') ).parent().show();
            }
        }

        // show the advanced functions
        var showadvanced = function(event) {
            event.preventDefault();
            if ( jQuery(this).hasClass('facetview_open') ) {
                jQuery(this).removeClass('facetview_open').siblings().hide();
            } else {
                jQuery(this).addClass('facetview_open').siblings().show();
            }
        }

        // limit the filter values available based on text input
        // by running a search with additional filter param and rebuilding filter values
        var limitfilters = function(event) {
            var query = searchquery();            
            jQuery('.facetview_freetextfilter').each(function() {
                if ( jQuery(this).val().length > 0 ) {
                    if ( query.indexOf("*:*") != -1 ) { 
                        query = query.replace("*:*","");
                    } else {
                        query += ' AND '; 
                    }
                    var facet = jQuery(this).attr("id").replace("facetview_freetext_","");
                    var terms = jQuery(this).val().split(" ");
                    for (var item in terms) {
                        if ( terms[item].length > 0 ) {
                            query += facet + ':"' + terms[item] + '*" AND ';
                        }
                    }
                }
            });
            query = query.replace(/ AND $/,"");
            jQuery.ajax( { 
                type: "get", url: query, dataType: "jsonp", jsonp:"json.wrf", success: function(data) {
                    putvalsinfilters(data); 
                } 
            });
        }

        // pass a list of filters to be displayed
        var buildfilters = function() {
            var filters = options.default_filters;
            var thefilters = "<p>FILTERS</p>";
            for ( var item in filters ) {
                thefilters += '<a class="facetview_filtershow" rel="' + 
                    filters[item] + '" href="">' + filters[item] + '</a>';
                thefilters += '<ul id="facetview_' + filters[item] + '" class="facetview_filters"></ul>';
            }
            $('#facetview_filters').append(thefilters);
            $('.facetview_filtershow').bind('click',showfiltervals);
            $('.facetview_freetextfilter').bindWithDelay('keyup',limitfilters,options.freetext_submit_delay);
            $('.facetview_freetext_filterdiv').hide();
        }

        // add a filter when a new one is provided
        var addfilters = function() {
            options.default_filters.push(jQuery(this).val());
            // remove any current filters
            jQuery('#facetview_filters').html("");
            buildfilters();
            dosearch();
        }

        // set the available filter values based on results
        var putvalsinfilters = function(data) {
            // for each filter setup, find the results for it and append them to the relevant filter
            for ( var each in options.default_filters ) {
                jQuery('#facetview_' + options.default_filters[each]).children().remove();
                var records = data["facets"][ options.default_filters[each] ];
                for ( var item in records ) {
                    var append = '<li><a class="facetview_filterchoice' +
                        '" rel="' + options.default_filters[each] + '" href="' + item + '">' + item +
                        ' (' + records[item] + ')</a></li>';
                    jQuery('#facetview_' + options.default_filters[each]).append(append);
                }
                if ( !jQuery('.facetview_filtershow[rel="' + options.default_filters[each] + '"]').hasClass('facetview_open') ) {
                    jQuery('#facetview_' + options.default_filters[each] ).children().hide();
                }
            }
            //jQuery('.facetview_open').removeClass('facetview_open');
            jQuery('.facetview_filterchoice').bind('click',clickfilterchoice);
        }

        // set the user admin filters
        var advanced = function() {
            var advanceddiv = '<div id="facetview_advanced">' + 
                '<a class="facetview_advancedshow" href="">ADVANCED ...</a>' +
                '<p>add filter:<br /><select id="facetview_addfilters"></select></p></div>';
            jQuery('#facetview_filters').after(advanceddiv);
            jQuery('.facetview_advancedshow').bind('click',showadvanced).siblings().hide();
        }
        
        // populate the advanced options
        var populateadvanced = function(data) {
            // iterate through source keys
            var options = "";
            for (var item in data["records"][0]) {
                options += '<option>' + item + '</option>';
            }
            jQuery('#facetview_addfilters').html("");
            jQuery('#facetview_addfilters').append(options);
            jQuery('#facetview_addfilters').change(addfilters);
        
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

        // write objects to string
        var to_s = function(thing) {
            var s = (thing instanceof Array) ? "[" : "{";
            for (i in thing) {
                if (thing[i] && typeof thing[i] == "object") {
                    s += '    "' + i + '":' + to_s(thing[i]) + ', ';
                } else {
                    s += (thing instanceof Array) ? "" : '"' + i + '":';
                    s += '"' + thing[i] + '", ';
                }
            }
            s += (thing instanceof Array) ? "]" : "}";    
            s = s.replace(/, ]/g,"]").replace(/, }/g,"}");
            return s;
        }

        // decrement result set
        var decrement = function(event) {
            event.preventDefault();
            options.default_paging.from = parseInt(jQuery(this).attr('href')) - options.default_paging.size;
            if ( options.default_paging.from < 0 ) {
                options.default_paging.from = 0;
            }
            dosearch();
        }

        // increment result set
        var increment = function(event) {
            event.preventDefault();
            options.default_paging.from = parseInt(jQuery(this).attr('href'));
            dosearch();
        }

        // write the metadata to the page
        var putmetadata = function(data) {
            var meta = "";
            meta += '<a id="facetview_decrement" href="' + options.default_paging.from + '">--</a> ';
            meta += 'results ' + options.default_paging.from + ' to ' + (options.default_paging.from + 10) + ' of ' + data.found;
            meta += '<a id="facetview_increment" href="' + (options.default_paging.from + 10) + '">++</a>';
            jQuery('#facetview_metadata').html("").append(meta);
            jQuery('#facetview_decrement').bind('click',decrement);
            jQuery('#facetview_increment').bind('click',increment);

        }

        // given a result record, build how it should look on the page
        var buildrecord = function(record) {
            var result = '<div class="facetview_result">';
            var displays = options.result_display_headers
            for (var item in displays) {
                if ( item == 0 ) {
                    if ( record[displays[item]] ) {
                        result += '<a class="facetview_more" href="">' + 
                            record[displays[item]] + '</a>';
                    } else {
                        result += '<a class="facetview_more" href="">UNKNOWN ITEM</a>';
                    }                
                } else {
                    if ( record[displays[item]] ) {
                        result += '<div class="facetview_resultextra">' + 
                            record[displays[item]] + '</div>';
                    }
                }
            }
            result += '<table class="facetview_moreinfo">';
            for ( var each in record ) {
                if ( jQuery.inArray(each,options.ignore_fields) == -1 ) {
                    result += '<tr><td class="facetview_moretabletitle">' + 
                        each + '</td>' + '<td class="facetview_fixed">' + record[each] + '</td></tr>';
                }
            }
            result += '</table>';
            return result;
        }

        // show more details of an event, and trigger the book search
        var showmore = function(event) {
            event.preventDefault();
            if ( !jQuery(this).hasClass('facetview_open') ) {
                jQuery(this).addClass('facetview_open').siblings().show();
                jQuery(this).siblings('.facetview_resultextra').hide();
            } else {
                jQuery(this).removeClass('facetview_open').siblings().not('.facetview_resultextra').hide();
                jQuery(this).siblings('.facetview_resultextra').show();
            }
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
            jQuery('#facetview_results').html("");
            var infofiltervals = new Array();
            jQuery.each(data.records, function(index, value) {
                // write them out to the results div
                jQuery('#facetview_results').append( buildrecord(value) );
            });
            // bind the more action to show the hidden details
            jQuery('.facetview_more').bind('click',showmore);
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
            for (var item in options.default_paging) {
                pageparams += item + "=" + options.default_paging[item] + "&";
            }
            // set facet params
            var urlfilters = "";
            for (var item in options.default_filters) {
                urlfilters += "facet.field=" + options.default_filters[item] + "&";
            }
            // build starting URL
            var theurl = options.search_url + urlparams + pageparams + urlfilters + options.query_parameter + "=";
            // add default query values
            // build the query, starting with default values
            var query = "";
            for (var item in options.predefined_query_values) {
                query += item + ":" + options.predefined_query_values[item] + " AND ";
            }
            jQuery('.facetview_filterselected',obj).each(function() {
                query += jQuery(this).attr('rel') + ':"' + 
                    jQuery(this).attr('href') + '" AND ';
            });
            // add any freetext filter
            if (jQuery('#facetview_freetext').val() != "") {
                query += jQuery('#facetview_freetext').val() + '*';
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
            // build the query, starting with default values
            var query = "";
            for (var item in options.predefined_query_values) {
                query += item + ":" + options.predefined_query_values[item] + " AND ";
            }
            jQuery('.facetview_filterselected',obj).each(function() {
                query += jQuery(this).attr('rel') + ':' + 
                    jQuery(this).attr('href').replace(/:/g,"_") + ' AND ';
            });
            // add any freetext filter
            if (jQuery('#facetview_freetext').val() != "") {
                query += jQuery('#facetview_freetext').val() + '*';
            }
            query = query.replace(/ AND $/,"");
            // set a default for blank search
            if (query == "") {
                query = options.q;
            }
            var querystring = '{';
            if ( options.default_paging.from != 0 ) {
                querystring += '"from":' + options.default_paging.from + ',';
            }
            if ( options.default_paging.size != 10 ) {
                querystring += '"size":' + options.default_paging.size + ',';
            }
            querystring += '"query":{"query_string":{"query":"' + query + '"}},"facets":{';
            for (var item in options.default_filters) {
                querystring += '"' + options.default_filters[item] + '":{"terms":{"field":"' + options.default_filters[item] + '.raw","size":200,"order":"term"}},';
            }
            querystring = querystring.replace(/\,$/,"");
            querystring += '}}';
            return querystring;
        }

        // execute a search
        var dosearch = function() {
            if ( options.search_index == "elasticsearch" ) {
                jQuery.ajax( { type: "post", url: options.search_url, data:elasticsearchquery(), processData:false, dataType:"json", success: function(data) { showresults(data) } } );
            } else {
                jQuery.ajax( { type: "get", url: solrsearchquery(), dataType:"jsonp", jsonp:"json.wrf", success: function(data) { showresults(data) } } );
            }
        }

        // trigger a search when a filter choice is clicked
        var clickfilterchoice = function(event) {
            event.preventDefault();
            var newobj = '<li><a class="facetview_filterselected" rel="' + 
                jQuery(this).attr("rel") + '" href="' + jQuery(this).attr("href") + '">' +
                jQuery(this).html() + '</a><a class="facetview_clear" href="">x</a></li>';
            jQuery('#facetview_selectedfilters').append(newobj);
            jQuery('.facetview_clear').unbind('click',clearfilter);
            jQuery('.facetview_clear').bind('click',clearfilter);
            dosearch();
        }

        // clear a filter when clear button is pressed, and re-do the search
        var clearfilter = function(event) {
            event.preventDefault();
            if ( jQuery(this).attr('id') == "facetview_clearall" ) {
                jQuery('#facetview_freetext',obj).val("");
            } else {
                jQuery(this).parent().remove();
            }
            dosearch();
        }


        // the facet view object to be appended to the page
        var thefacetview = '<div id="facetview">' +
            '<div id="facetview_header">';
        if ( options.header_content) { thefacetview += options.header_content; }
        thefacetview += '</div>' + '<div class="facetview_column">' +
            '<div id="facetview_search">SEARCH<br />' +
            '<span class="facetview_green">Find </span>' +
            '<input type="text" id="facetview_freetext" />' +
            '<ul id="facetview_selectedfilters"></ul></div>' + 
            '<div id="facetview_filters"></div>' + 
            '</div><div class="facetview_column">' +
            '<div id="facetview_metadata"></div>' +
            '<div id="facetview_results"></div>' +
            '</div>' + 
            '<div id="facetview_footer">';
        if ( options.footer_content) { thefacetview += options.footer_content; }
        thefacetview += '</div></div>';


        // ===============================================
        // now create the plugin on the page
        return this.each(function() {
            // get this object
            obj = $(this);

            // append the facetview object to this object
            $(obj).append(thefacetview);

            // append the filters to the facetview object
            buildfilters();
            $('#facetview_freetext',obj).bindWithDelay('keyup',dosearch,options.freetext_submit_delay);

            // add userconfig functions
            options.show_advanced ? advanced() : "";

            // trigger the search once on load, to get all results
            dosearch();

        }); // end of the function  


    };
})(jQuery);


