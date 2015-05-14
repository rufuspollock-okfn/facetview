 This version of facetview works with solr_4.10.4
1. Whatever the content is displayed in results, depends upon you and on what fields you have done your solr indexing. 
  Following Info may help you customize it according to your wish.

#For whatever fields of results from want from resultant json, 
 	add that fields in resdisplay(line 343) in jquery.facetview.js
	you can customize this fields as per documentation above the function.

#For field name "attr_stream_name", this contains the name of the file, I have added changes for it in the anchor field to navigate to the field, 
	so make sure files are at correct path. 

#For the facets to be deicded you need to make changes in var facets(line 33) in index.html.
	you can see these facets in you solr localhost.

#The search_url values in index.html(line 26) should point to collection value.(currently its pointing to collection1 and port 8983)

Hopefully, this will help to configure to get the desired result sets.

  	


