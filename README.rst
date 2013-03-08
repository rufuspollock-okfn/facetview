FacetView_ is a pure javascript frontend for ElasticSearch search
indices.

(This used to work against SOLR too, but the need to maintain support for that became less, and is now not a priority. So has been removed altogether. If anyone needs it, it could be added back in by writing an alternative to the elasticsearchquery() with a solrsearchquery(), and making sure the returned resultset can be parsed out properly. Used to work fine so it can be done, but as new functionality like nesting and so on was brought in, it became less important.)

It's been developed as a jQuery plugin and lets you easily embed a faceted
browse front end into any web page.

.. _FacetView: http://okfnlabs.org/facetview/

Development is now taking place in this repo: http://github.com/okfn/facetview


Demo
====

See http://okfnlabs.org/facetview/ or if you have the source just take a look 
at index.html or simple.html


Status
======

FacetView is pretty new, and still under active development but is already
pretty stable. If you have suggestions or want to make a contribution please
check out the github repo.


Using FacetView
===============

Add the following code to your web page::

  <script type="text/javascript" src="vendor/jquery/1.7.1/jquery-1.7.1.min.js"></script>
  <link rel="stylesheet" href="vendor/bootstrap/css/bootstrap.min.css">
  <script type="text/javascript" src="vendor/bootstrap/js/bootstrap.min.js"></script>  
  <script type="text/javascript" src="vendor/linkify/1.0/jquery.linkify-1.0-min.js"></script>  
  <link rel="stylesheet" href="vendor/jquery-ui-1.8.18.custom/jquery-ui-1.8.18.custom.css">
  <script type="text/javascript" src="vendor/jquery-ui-1.8.18.custom/jquery-ui-1.8.18.custom.min.js"></script>
  <script type="text/javascript" src="jquery.facetview.js"></script>
  <link rel="stylesheet" href="css/facetview.css">
  <script type="text/javascript" src="vendor/d3/d3.min.js"></script>
  <script type="text/javascript" src="vendor/d3/d3.geom.min.js?2.1.3"></script>
  <script type="text/javascript" src="vendor/d3/d3.layout.min.js?2.1.3"></script>


* BUT change the src URLs to something sensible depending on where you install 
  the files; or something different if you have the files available already.
  If using your own, NOTE the versions; particularly bootstrap - we are on the 2.x
* d3 scripts can be dropped if you intend to disable filter visualisations.


Then add a script somewhere to your page that actually calls and sets up the 
facetview on a particular page element:

  <script type="text/javascript">
    jQuery(document).ready(function($) {
      $('.facet-view-simple').facetview({
        search_url: 'http://bibsoup.net/query?',
        search_index: 'elasticsearch',
        facets: [
            {'field': 'publisher.exact', 'size': 100, 'order':'term', 'display': 'publisher'},
            {'field': 'author.name.exact', 'display': 'author'},
            {'field': 'year.exact', 'display': 'year'}
        ],
      });
    });
  </script>


Now that you have everything ready, you will probably want to customize to
get it looking the way you want it.


Customization
=============

Once you have FacetView all ready to go, you should probably do some
customisation. There are a few ways to do this:

Edit the config in jquery.facetview.js
--------------------------------------

View the config options near the top of the file to learn more. Some 
important points:

* search_url – you need this. Should be an elasticsearch or SOLR query endpoint
* search_index – your index type, solr or elasticsearch
* result_display - there is a long example of result display. It is a list of 
  lists; each list represents a line; each line contains objects; the objects 
  specify the field they should output, and pre and post information to surround
  it with
* display_images - if this is set to true, then facetview will attempt to find 
  the first http://... that ends with .jpg / .jpeg / .png / .gif in each record;
  if one is found, it will be displayed in the search result as a 100 x (up to) 
  150 px thumbnail
* default_url_params – parameters to pass through with every query; should
  include “wt”:”json” for SOLR queries to return JSON, and probably
  “facet.mincount”:1 for SOLR queries to ignore zero counts on facet values
* predefined_filters – use these to apply some filters that will be appended 
  to every search. For example, customise a facetview display to only show 
  records with a particular owner / collection / tag / whatever

Pass in config settings when calling FacetView
----------------------------------------------

All of the settings can also be defined when calling FacetView, and will
overwrite the values set in the file itself. So you can do something like
this::

  <script type="text/javascript">
  jQuery(document).ready(function() {
      jQuery('YOUR-PAGE-PART').facetview({
          "search_index":"elasticsearch",
          ...
      });
  });
  </script>

Passing config parameters in the URL
------------------------------------

Configs can be passed on the URL as query parameters. For example, 
?q=blah will set the starting search to "blah". You can add complex 
queries as JSON objects, such as ?paging={"size":20,"from":10}. Nice...

Providing the location of an external config file
-------------------------------------------------

A file can be made available anywhere on the web (depending, keep reading) 
with any of the above listed settings in it (written in the usual way for a 
JSON object). Then, just pass the URL of your config file when you call 
FacetView - as a parameter called "config_file", and it will attempt to read 
that config file for you.

The first attempt will make a JSONP request to the URL you specify, so if your 
file is properly set up on a server that enables it to respond to such a request, 
you can make these calls to any address on the internet.

If JSONP call fails, then a normal GET will be executed. So if the file is under 
the same domain, it should be retrievable. In this case, the file must be 
normally readable to a GET request - e.g. it should have a .html extension, or 
be otherwise set up to return your config as a string to the GET request. The 
JSON config object is then parsed and read in.

Config precedence
-----------------

When you introduce a new config object, they are merged into earlier configs with 
overwrite. So any config you specify in facetview.jquery.js will be overwritten 
and appended with newer info from any config passed in when calling facetview, 
which is overwritten by config parameters passed in the URL, 
and a call to a remote config file will similarly overwrite and append to all 
previous.

Change the layout by making and using a custom CSS file
-------------------------------------------------------

Facetview uses the latest `twitter bootstrap`_. When you embed facetview in a page, 
you need to include the calls to bootstrap js and css files (see the example 
index.html here for more info). You could restyle facetview any way you want, 
either with or without bootstrap - although it would be a hassle to strip 
bootstrap out; recommend working with or around it.


Copyright and License
=====================

Copyright 2011 Open Knowledge Foundation and Cottage Labs.

Licensed under the `MIT License`_

.. _twitter bootstrap: http://twitter.github.com/bootstrap/
.. _MIT License: http://www.opensource.org/licenses/mit-license.php

